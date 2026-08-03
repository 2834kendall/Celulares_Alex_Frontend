import { l2Normalize } from '@/modules/attendance/lib/face/faceMath'
import { FACE_INPUT_SIZE } from '@/modules/attendance/lib/face/model'

/**
 * Embedding de PRUEBA — NUNCA reconocimiento facial real. Reemplaza el paso
 * "imagen -> 128 numeros" con una cuenta determinista de luminancia por
 * celda de una grilla, para poder probar el resto del sistema (camara,
 * parpadeo, cifrado, comparacion, umbrales MATCH/REQUIRE_PIN/DENIED, ticket,
 * marca) mientras no esten los pesos de face-api.js en public/models/face-api/.
 *
 * Solo sustituye ESTE paso: la imagen sigue sin salir nunca del dispositivo
 * (no se guarda, no se envia — el vector resultante se cifra exactamente
 * igual que el de un modelo real), y todo lo que viene despues (faceCrypto,
 * verifyFace, la distancia coseno, registerKioskMark) es el codigo real de
 * produccion, sin cambios.
 *
 * Gateado por NEXT_PUBLIC_FACE_TEST_MODE (ver embedding.ts) — jamas debe
 * quedar activo en produccion: no distingue caras de verdad, solo aproxima
 * "se parece" por brillo y encuadre.
 */

const GRID_COLS = 16
const GRID_ROWS = 8 // 16 * 8 = FACE_EMBEDDING_DIM (128)

export function computeTestEmbedding(rgba: Uint8ClampedArray, size = FACE_INPUT_SIZE): number[] {
  const expected = size * size * 4
  if (rgba.length !== expected) {
    throw new Error(`Recorte facial invalido: ${rgba.length} bytes, esperaba ${expected}.`)
  }

  const cellW = size / GRID_COLS
  const cellH = size / GRID_ROWS
  const sums = new Array(GRID_COLS * GRID_ROWS).fill(0)
  const counts = new Array(GRID_COLS * GRID_ROWS).fill(0)

  for (let y = 0; y < size; y++) {
    const row = Math.min(GRID_ROWS - 1, Math.floor(y / cellH))
    for (let x = 0; x < size; x++) {
      const col = Math.min(GRID_COLS - 1, Math.floor(x / cellW))
      const idx = row * GRID_COLS + col
      const px = (y * size + x) * 4
      // Luminancia perceptual (BT.601) — el alfa no participa.
      const luminance = 0.299 * rgba[px] + 0.587 * rgba[px + 1] + 0.114 * rgba[px + 2]
      sums[idx] += luminance
      counts[idx] += 1
    }
  }

  const vector = sums.map((sum, i) => (counts[i] > 0 ? sum / counts[i] / 255 - 0.5 : 0))

  return l2Normalize(vector)
}
