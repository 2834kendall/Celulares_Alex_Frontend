/**
 * Copia a /public los runtimes WASM que el reconocimiento facial necesita en
 * el navegador (MediaPipe y ONNX Runtime Web) y verifica que los dos modelos
 * esten presentes. Se corre solo via predev/prebuild: los archivos copiados
 * NO se versionan (public/models/*-wasm esta en .gitignore) porque salen de
 * node_modules y deben seguir la version instalada del paquete.
 *
 * Modelos (SI versionados, no salen de node_modules):
 *   public/models/face_landmarker.task  — MediaPipe Face Landmarker. Se
 *     autodescarga si falta: la URL es el bucket oficial de Google
 *     (storage.googleapis.com/mediapipe-models), la misma que documenta
 *     MediaPipe — no un mirror de terceros, por eso aca si se automatiza.
 *   public/models/mobilefacenet.onnx    — MobileFaceNet (embeddings 128d).
 *     Deliberadamente SIN autodescarga: no existe una fuente oficial unica
 *     para este export (son conversiones de comunidad de procedencia
 *     variable) y es la pieza que decide "es la misma persona" en un
 *     sistema de asistencia — se genera con
 *     scripts/export_mobilefacenet.py a partir de pesos que el equipo elija
 *     y pueda auditar, en vez de confiar en un binario de un repo random.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const publicModels = join(root, 'public', 'models')

const FACE_LANDMARKER_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task'

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

async function ensureFaceLandmarker() {
  const dest = join(publicModels, 'face_landmarker.task')
  if (existsSync(dest)) return

  console.log('[face-assets] Descargando face_landmarker.task desde Google (mediapipe-models)…')
  try {
    const res = await fetch(FACE_LANDMARKER_URL)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const bytes = new Uint8Array(await res.arrayBuffer())
    mkdirSync(publicModels, { recursive: true })
    writeFileSync(dest, bytes)
    console.log(`[face-assets] face_landmarker.task descargado (${bytes.length} bytes).`)
  } catch (err) {
    console.warn(
      `[face-assets] AVISO: no se pudo descargar face_landmarker.task (${err.message}).\n` +
        '  Sin red, el kiosco caera al flujo de PIN. Reintenta con internet o descargalo a mano:\n' +
        `  ${FACE_LANDMARKER_URL}`
    )
  }
}

// MediaPipe: el FilesetResolver pide el .js y el .wasm del mismo directorio.
copyDir(
  join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm'),
  join(publicModels, 'mediapipe-wasm'),
  (n) => n.endsWith('.js') || n.endsWith('.wasm')
)

// ONNX Runtime Web: solo la variante simd-threaded base (la que usa el
// execution provider 'wasm' por defecto).
copyDir(
  join(root, 'node_modules', 'onnxruntime-web', 'dist'),
  join(publicModels, 'ort-wasm'),
  (n) => n.startsWith('ort-wasm-simd-threaded') && (n.endsWith('.wasm') || n.endsWith('.mjs'))
)

await ensureFaceLandmarker()

const missing = ['face_landmarker.task', 'mobilefacenet.onnx'].filter(
  (m) => !existsSync(join(publicModels, m))
)

if (missing.length > 0) {
  console.warn(
    `[face-assets] AVISO: faltan modelos en public/models: ${missing.join(', ')}.\n` +
      '  El kiosco caera automaticamente al flujo de PIN hasta que existan.\n' +
      '  Ver srgh-app/public/models/README.md para las fuentes de descarga.'
  )
} else {
  console.log('[face-assets] Runtimes WASM copiados y modelos presentes.')
}
