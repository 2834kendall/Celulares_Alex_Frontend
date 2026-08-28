/**
 * Copia a /public el runtime WASM de MediaPipe y descarga los modelos de
 * reconocimiento facial si faltan. Se corre solo via predev/prebuild.
 *
 * public/models/mediapipe-wasm/  — NO se versiona (.gitignore): sale de
 *   node_modules y debe seguir la version instalada del paquete.
 *
 * Modelos (SI versionados, no salen de node_modules):
 *   face_landmarker.task              — MediaPipe Face Landmarker. Se
 *     autodescarga si falta: la URL es el bucket oficial de Google
 *     (storage.googleapis.com/mediapipe-models), la misma que documenta
 *     MediaPipe — no un mirror de terceros.
 *   face-api/face_recognition_model-* — Red de reconocimiento de
 *     @vladmandic/face-api (fork mantenido de face-api.js). Tambien se
 *     autodescarga: verificamos su procedencia antes de automatizar esto —
 *     pesos entrenados por davisking (creador de dlib, Boost License 1.0,
 *     uso comercial permitido) empaquetados por face-api.js (MIT, uso
 *     comercial confirmado por el propio mantenedor). Ver
 *     public/models/README.md para el detalle completo.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const publicModels = join(root, 'public', 'models')
const faceApiModels = join(publicModels, 'face-api')

const FACE_LANDMARKER_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task'

const FACE_API_REPO_RAW = 'https://raw.githubusercontent.com/vladmandic/face-api/master/model'
const FACE_RECOGNITION_FILES = [
  'face_recognition_model-weights_manifest.json',
  'face_recognition_model.bin',
]

function copyDir(fromDir, toDir, filter) {
  if (!existsSync(fromDir)) {
    console.error(`[face-assets] No existe ${fromDir} — ¿falta pnpm install?`)
    process.exitCode = 1
    return
  }
  mkdirSync(toDir, { recursive: true })
  for (const name of readdirSync(fromDir)) {
    if (!filter(name)) continue
    copyFileSync(join(fromDir, name), join(toDir, name))
  }
}

async function downloadFile(url, dest) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const bytes = new Uint8Array(await res.arrayBuffer())
  writeFileSync(dest, bytes)
  return bytes.length
}

async function ensureFaceLandmarker() {
  const dest = join(publicModels, 'face_landmarker.task')
  if (existsSync(dest)) return

  console.log('[face-assets] Descargando face_landmarker.task desde Google (mediapipe-models)…')
  try {
    mkdirSync(publicModels, { recursive: true })
    const size = await downloadFile(FACE_LANDMARKER_URL, dest)
    console.log(`[face-assets] face_landmarker.task descargado (${size} bytes).`)
  } catch (err) {
    console.warn(
      `[face-assets] AVISO: no se pudo descargar face_landmarker.task (${err.message}).\n` +
        '  Sin red, el kiosco caera al flujo de PIN. Reintenta con internet o descargalo a mano:\n' +
        `  ${FACE_LANDMARKER_URL}`
    )
  }
}

async function ensureFaceRecognitionModel() {
  const missing = FACE_RECOGNITION_FILES.filter((f) => !existsSync(join(faceApiModels, f)))
  if (missing.length === 0) return

  console.log('[face-assets] Descargando el modelo de reconocimiento de @vladmandic/face-api…')
  try {
    mkdirSync(faceApiModels, { recursive: true })
    for (const file of missing) {
      const size = await downloadFile(`${FACE_API_REPO_RAW}/${file}`, join(faceApiModels, file))
      console.log(`[face-assets] ${file} descargado (${size} bytes).`)
    }
  } catch (err) {
    console.warn(
      `[face-assets] AVISO: no se pudo descargar el modelo de reconocimiento (${err.message}).\n` +
        '  Sin el, el kiosco NO puede generar embeddings y cae al flujo de PIN.\n' +
        '  NO entra solo en modo de prueba: NEXT_PUBLIC_FACE_TEST_MODE hay que\n' +
        '  ponerlo a mano, y solo con el valor exacto "true".\n' +
        `  Fuente: ${FACE_API_REPO_RAW}`
    )
  }
}

/**
 * Clasificador anti-spoofing (MiniFASNetV2). A diferencia de los otros dos,
 * este SI se versiona: pesa 1.7 MB y su procedencia se verifico a mano, asi
 * que se prefiere tenerlo fijo en el repo antes que depender de que un tercero
 * siga publicando el archivo. La descarga es solo la red de seguridad para un
 * clon que llegue sin el.
 *
 * El SHA-256 esperado esta abajo a proposito: si algun dia el archivo de
 * origen cambia, el build lo grita en vez de aceptar en silencio otros pesos.
 */
const ANTISPOOF_URL =
  'https://huggingface.co/garciafido/minifasnet-v2-anti-spoofing-onnx/resolve/main/minifasnet_v2.onnx'
const ANTISPOOF_SHA256 = 'd7b3cd9ba8a7ceb13baa8c4720902e27ca3112eff52f926c08804af6b6eecc7b'

async function ensureAntispoofModel() {
  const dir = join(publicModels, 'antispoof')
  const dest = join(dir, 'minifasnet_v2.onnx')
  if (existsSync(dest)) {
    const actual = createHash('sha256').update(readFileSync(dest)).digest('hex')
    if (actual !== ANTISPOOF_SHA256) {
      console.warn(
        `[face-assets] AVISO: minifasnet_v2.onnx no coincide con el SHA-256 esperado.\n` +
          `  esperado: ${ANTISPOOF_SHA256}\n  actual:   ${actual}\n` +
          '  El modelo pudo haber sido reemplazado. Revisar antes de confiar en el.'
      )
    }
    return
  }

  console.log('[face-assets] Descargando el clasificador anti-spoofing (MiniFASNetV2)…')
  try {
    mkdirSync(dir, { recursive: true })
    const size = await downloadFile(ANTISPOOF_URL, dest)
    const actual = createHash('sha256').update(readFileSync(dest)).digest('hex')
    if (actual !== ANTISPOOF_SHA256) {
      throw new Error(`SHA-256 no coincide (esperado ${ANTISPOOF_SHA256}, obtenido ${actual})`)
    }
    console.log(`[face-assets] minifasnet_v2.onnx descargado y verificado (${size} bytes).`)
  } catch (err) {
    console.warn(
      `[face-assets] AVISO: no se pudo obtener el clasificador anti-spoofing (${err.message}).\n` +
        '  SIN EL, el kiosco NO puede confirmar que haya una persona real y cae al PIN.\n' +
        `  Fuente: ${ANTISPOOF_URL}`
    )
  }
}

// MediaPipe: el FilesetResolver pide el .js y el .wasm del mismo directorio.
copyDir(
  join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm'),
  join(publicModels, 'mediapipe-wasm'),
  (n) => n.endsWith('.js') || n.endsWith('.wasm')
)

// onnxruntime-web: solo el par base simd-threaded. El paquete trae ademas las
// variantes jsep/asyncify/jspi (WebGPU, WebNN) que suman ~70 MB y no se usan —
// antispoof.ts fuerza el backend WASM con un solo hilo.
copyDir(
  join(root, 'node_modules', 'onnxruntime-web', 'dist'),
  join(publicModels, 'ort'),
  (n) => n === 'ort-wasm-simd-threaded.wasm' || n === 'ort-wasm-simd-threaded.mjs'
)

await ensureFaceLandmarker()
await ensureFaceRecognitionModel()
await ensureAntispoofModel()

const missing = [
  'face_landmarker.task',
  'antispoof/minifasnet_v2.onnx',
  ...FACE_RECOGNITION_FILES.map((f) => `face-api/${f}`),
].filter((m) => !existsSync(join(publicModels, m)))

if (missing.length > 0) {
  console.warn(
    `[face-assets] AVISO: faltan modelos en public/models: ${missing.join(', ')}.\n` +
      '  El kiosco caera automaticamente al flujo de PIN hasta que existan.\n' +
      '  Ver srgh-app/public/models/README.md para las fuentes de descarga.'
  )
} else {
  console.log('[face-assets] Runtime WASM copiado y modelos presentes.')
}
