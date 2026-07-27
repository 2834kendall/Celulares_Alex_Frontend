/**
 * Helpers PUROS sobre los resultados de MediaPipe Face Landmarker (tipados
 * estructuralmente para no arrastrar la libreria a los tests): extraccion de
 * scores de parpadeo y calculo del recorte cuadrado del rostro.
 */

interface BlendshapeCategory {
  categoryName: string
  score: number
}

interface LandmarkerResultShape {
  faceLandmarks: { x: number; y: number }[][]
  faceBlendshapes: { categories: BlendshapeCategory[] }[]
}

export interface BlinkScores {
  blinkLeft: number
  blinkRight: number
}

/** Scores de parpadeo del primer rostro, o null si no hay rostro/blendshapes. */
export function extractBlinkScores(result: LandmarkerResultShape): BlinkScores | null {
  const categories = result.faceBlendshapes?.[0]?.categories
  if (!categories || categories.length === 0) return null

  let blinkLeft: number | null = null
  let blinkRight: number | null = null

  for (const c of categories) {
    if (c.categoryName === 'eyeBlinkLeft') blinkLeft = c.score
    else if (c.categoryName === 'eyeBlinkRight') blinkRight = c.score
  }

  if (blinkLeft === null || blinkRight === null) return null
  return { blinkLeft, blinkRight }
}

export interface CropBox {
  x: number
  y: number
  size: number
}

/**
 * Caja CUADRADA (en pixeles) que aisla el rostro para el modelo de
 * embeddings: bounding box de los landmarks + margen, centrada y recortada a
 * los bordes del frame. Cuadrada porque MobileFaceNet espera 112x112 y
 * estirar un rectangulo deformaria la cara (y el embedding).
 */
export function faceCropBox(
  landmarks: { x: number; y: number }[],
  frameWidth: number,
  frameHeight: number,
  marginRatio = 0.25
): CropBox | null {
  if (landmarks.length === 0 || frameWidth <= 0 || frameHeight <= 0) return null

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const p of landmarks) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }

  // Landmarks vienen normalizados 0..1 → a pixeles.
  const pxMinX = minX * frameWidth
  const pxMaxX = maxX * frameWidth
  const pxMinY = minY * frameHeight
  const pxMaxY = maxY * frameHeight

  const faceW = pxMaxX - pxMinX
  const faceH = pxMaxY - pxMinY
  if (faceW <= 0 || faceH <= 0) return null

  const centerX = (pxMinX + pxMaxX) / 2
  const centerY = (pxMinY + pxMaxY) / 2

  let size = Math.max(faceW, faceH) * (1 + marginRatio * 2)
  size = Math.min(size, frameWidth, frameHeight)

  let x = centerX - size / 2
  let y = centerY - size / 2
  x = Math.max(0, Math.min(x, frameWidth - size))
  y = Math.max(0, Math.min(y, frameHeight - size))

  return { x, y, size }
}

/** Landmarks del primer rostro detectado, o null. */
export function firstFaceLandmarks(
  result: LandmarkerResultShape
): { x: number; y: number }[] | null {
  const landmarks = result.faceLandmarks?.[0]
  return landmarks && landmarks.length > 0 ? landmarks : null
}
