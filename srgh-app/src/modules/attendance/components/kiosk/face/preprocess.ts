import { FACE_INPUT_SIZE } from '@/modules/attendance/lib/face/model'

/**
 * Convierte los pixeles RGBA del recorte facial (canvas 112x112) al tensor
 * de entrada de MobileFaceNet: Float32 NCHW [1, 3, 112, 112] con
 * normalizacion (v - 127.5) / 128 → rango ~[-1, 1]. Puro: bytes adentro,
 * floats afuera, sin canvas ni ONNX — por eso se puede testear en Node.
 */
export function rgbaToNchwFloat32(rgba: Uint8ClampedArray, size = FACE_INPUT_SIZE): Float32Array {
  const expected = size * size * 4
  if (rgba.length !== expected) {
    throw new Error(`Recorte facial invalido: ${rgba.length} bytes, esperaba ${expected}.`)
  }

  const plane = size * size
  const out = new Float32Array(3 * plane)

  for (let i = 0; i < plane; i++) {
    const px = i * 4
    out[i] = (rgba[px] - 127.5) / 128 // R
    out[plane + i] = (rgba[px + 1] - 127.5) / 128 // G
    out[2 * plane + i] = (rgba[px + 2] - 127.5) / 128 // B
  }

  return out
}
