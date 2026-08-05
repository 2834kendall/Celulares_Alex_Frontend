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
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
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
        '  El kiosco caera al modo de prueba (NEXT_PUBLIC_FACE_TEST_MODE) hasta que exista.\n' +
        `  Fuente: ${FACE_API_REPO_RAW}`
    )
  }
}

// MediaPipe: el FilesetResolver pide el .js y el .wasm del mismo directorio.
copyDir(
  join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm'),
  join(publicModels, 'mediapipe-wasm'),
  (n) => n.endsWith('.js') || n.endsWith('.wasm')
)

await ensureFaceLandmarker()
await ensureFaceRecognitionModel()

const missing = [
  'face_landmarker.task',
  ...FACE_RECOGNITION_FILES.map((f) => `face-api/${f}`),
].filter((m) => !existsSync(join(publicModels, m)))

if (missing.length > 0) {
  console.warn(
    `[face-assets] AVISO: faltan modelos en public/models: ${missing.join(', ')}.\n` +
      '  El kiosco caera automaticamente al flujo de PIN/modo de prueba hasta que existan.\n' +
      '  Ver srgh-app/public/models/README.md para las fuentes de descarga.'
  )
} else {
  console.log('[face-assets] Runtime WASM copiado y modelos presentes.')
}
