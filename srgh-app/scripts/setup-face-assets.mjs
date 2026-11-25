/**
 * Copia a /public el runtime WASM de MediaPipe y descarga los modelos de
 * reconocimiento facial si faltan. Se corre solo via predev/prebuild.
 *
 * public/models/mediapipe-wasm/ y public/models/ort/ — NO se versionan
 *   (.gitignore): salen de node_modules y siguen la version instalada.
 *
 * Modelos (SI versionados, no salen de node_modules):
 *   face_landmarker.task              — MediaPipe Face Landmarker, del bucket
 *     oficial de Google (storage.googleapis.com/mediapipe-models).
 *   hand_landmarker.task              — MediaPipe Hand Landmarker, mismo
 *     bucket. Solo lo usa el registro del rostro (mano sobre la cara).
 *   face-api/face_recognition_model-* — Red de reconocimiento de
 *     @vladmandic/face-api (fork mantenido de face-api.js). Pesos entrenados
 *     por davisking (creador de dlib, Boost License 1.0, uso comercial
 *     permitido) empaquetados por face-api.js (MIT). Ver
 *     public/models/README.md para el detalle completo.
 *   antispoof/minifasnet_v2.onnx      — Clasificador anti-spoofing.
 *
 * INTEGRIDAD (SGRH-117): cada modelo se descarga de una revision FIJA (nunca
 * `latest` ni `master`) y se compara con su SHA-256. La descarga va a un
 * archivo temporal y solo se mueve a su ruta final si el hash coincide: el
 * cliente carga esa ruta, asi que un archivo a medias o reemplazado nunca
 * llega a servirse. Un archivo presente que no coincide hace fallar el
 * script (y con el `pnpm dev` / `pnpm build`), en vez de avisar y seguir.
 *
 * Sin red, en cambio, solo se avisa: el kiosco cae al flujo de PIN.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const publicModels = join(root, 'public', 'models')

/** Commit de vladmandic/face-api que publico estos pesos (marzo 2021). */
const FACE_API_REVISION = 'ad61f77ea2962809bed52b5b18966fea80ab1273'
const FACE_API_RAW = `https://raw.githubusercontent.com/vladmandic/face-api/${FACE_API_REVISION}/model`

/**
 * `sha256` admite varios valores solo cuando el contenido es el mismo y
 * cambian los bytes: el manifiesto JSON versionado quedo reformateado por
 * Prettier, y el que baja del origen viene compacto. Para un binario va uno.
 *
 * `text: true` compara con los fines de linea normalizados a LF: git puede
 * dejar el JSON con CRLF en Windows y con LF en Linux (el CI), y son el mismo
 * archivo. Los binarios se comparan byte a byte.
 */
const MODELS = [
  {
    file: 'face_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
    sha256: ['64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff'],
    whenMissing: 'el kiosco no puede ubicar el rostro y cae al flujo de PIN',
  },
  {
    // Solo el registro del rostro: detecta una mano sobre la cara (SGRH-117).
    file: 'hand_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
    sha256: ['fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1'],
    whenMissing: 'el registro del rostro no puede detectar una mano sobre la cara y no se abre',
  },
  {
    file: 'face-api/face_recognition_model-weights_manifest.json',
    url: `${FACE_API_RAW}/face_recognition_model-weights_manifest.json`,
    sha256: [
      'cbaffa501b0b9275a12b63357a6843e7e30c054e1c9151e1a5f879b26e32986b',
      '766cc208d18e83e160d158a1b611a8d354e701ccf47f723d124aff44319b47b3',
    ],
    text: true,
    whenMissing: 'el kiosco no puede generar embeddings y cae al flujo de PIN',
  },
  {
    file: 'face-api/face_recognition_model.bin',
    url: `${FACE_API_RAW}/face_recognition_model.bin`,
    sha256: ['b413e420d6840b2775fba32008db6f3cddb07d485967fb42cfcf379c16a8c589'],
    whenMissing: 'el kiosco no puede generar embeddings y cae al flujo de PIN',
  },
  {
    file: 'antispoof/minifasnet_v2.onnx',
    url: 'https://huggingface.co/garciafido/minifasnet-v2-anti-spoofing-onnx/resolve/d29c87568ca9b5662da803b10f217c4db20b142b/minifasnet_v2.onnx',
    sha256: ['d7b3cd9ba8a7ceb13baa8c4720902e27ca3112eff52f926c08804af6b6eecc7b'],
    whenMissing: 'el kiosco no puede confirmar que haya una persona real y cae al PIN',
  },
]

const CR = 0x0d
const LF = 0x0a

/** SHA-256; con `text`, sobre el contenido con CRLF convertido a LF. */
function sha256Of(bytes, text = false) {
  if (!text) return createHash('sha256').update(bytes).digest('hex')
  const out = []
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === CR && bytes[i + 1] === LF) continue
    out.push(bytes[i])
  }
  return createHash('sha256').update(Uint8Array.from(out)).digest('hex')
}

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

/**
 * Verifica un modelo presente o lo descarga. Devuelve false solo ante un hash
 * que no coincide: es el unico caso que debe frenar el build.
 */
async function ensureModel({ file, url, sha256, whenMissing, text = false }) {
  const dest = join(publicModels, file)

  if (existsSync(dest)) {
    const actual = sha256Of(readFileSync(dest), text)
    if (sha256.includes(actual)) return true
    console.error(
      `[face-assets] ERROR: ${file} no coincide con el SHA-256 esperado.\n` +
        `  esperado: ${sha256.join(' o ')}\n  actual:   ${actual}\n` +
        '  El modelo pudo haber sido reemplazado. Restauralo desde git o borralo para\n' +
        '  que se descargue de nuevo desde su revision fija.'
    )
    return false
  }

  console.log(`[face-assets] Descargando ${file}…`)
  const temp = `${dest}.download`
  let bytes
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    bytes = new Uint8Array(await res.arrayBuffer())
  } catch (err) {
    console.warn(
      `[face-assets] AVISO: no se pudo descargar ${file} (${err.message}).\n` +
        `  Sin el, ${whenMissing}. Reintenta con internet.\n  Fuente: ${url}`
    )
    return true
  }

  const actual = sha256Of(bytes, text)
  if (!sha256.includes(actual)) {
    console.error(
      `[face-assets] ERROR: la descarga de ${file} no coincide con el SHA-256 esperado\n` +
        `  (esperado ${sha256.join(' o ')}, obtenido ${actual}). No se publico.\n  Fuente: ${url}`
    )
    return false
  }

  mkdirSync(dirname(dest), { recursive: true })
  try {
    writeFileSync(temp, bytes)
    renameSync(temp, dest)
  } finally {
    rmSync(temp, { force: true })
  }
  console.log(`[face-assets] ${file} descargado y verificado (${bytes.length} bytes).`)
  return true
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

let verified = true
for (const model of MODELS) {
  if (!(await ensureModel(model))) verified = false
}

const missing = MODELS.map((m) => m.file).filter((f) => !existsSync(join(publicModels, f)))

if (!verified) {
  console.error(
    `[face-assets] Hay modelos que no pasaron la verificacion en ${relative(root, publicModels)}.`
  )
  process.exitCode = 1
} else if (missing.length > 0) {
  console.warn(
    `[face-assets] AVISO: faltan modelos en public/models: ${missing.join(', ')}.\n` +
      '  El kiosco caera automaticamente al flujo de PIN hasta que existan.\n' +
      '  Ver srgh-app/public/models/README.md para las fuentes de descarga.'
  )
} else {
  console.log('[face-assets] Runtime WASM copiado y modelos verificados.')
}
