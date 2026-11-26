interface Point {
  x: number
  y: number
}

export interface FaceBounds {
  left: number
  right: number
  top: number
  bottom: number
}

export function faceBounds(landmarks: Point[]): FaceBounds {
  let left = Infinity
  let right = -Infinity
  let top = Infinity
  let bottom = -Infinity
  for (const { x, y } of landmarks) {
    left = Math.min(left, x)
    right = Math.max(right, x)
    top = Math.min(top, y)
    bottom = Math.max(bottom, y)
  }
  return { left, right, top, bottom }
}

function area(box: FaceBounds): number {
  return (box.right - box.left) * (box.bottom - box.top)
}

export function primaryFace<T extends Point>(
  faces: T[][],
  videoWidth: number,
  videoHeight: number
): { landmarks: T[] | null; crowded: boolean } {
  const [primary, secondary] = faces
    .filter((landmarks) => landmarks.length > 0)
    .map((landmarks) => {
      const box = faceBounds(landmarks)
      const x = ((box.left + box.right - 1) * videoWidth) / 2
      const y = ((box.top + box.bottom - 1) * videoHeight) / 2
      return { landmarks, area: area(box), centerDistance: x * x + y * y }
    })
    .sort((a, b) => b.area - a.area || a.centerDistance - b.centerDistance)

  return {
    landmarks: primary?.landmarks ?? null,
    crowded: Boolean(primary && secondary && secondary.area >= primary.area * 0.8),
  }
}

export function overlapsPreviousFace(previous: FaceBounds, current: FaceBounds): boolean {
  const width = Math.max(
    0,
    Math.min(previous.right, current.right) - Math.max(previous.left, current.left)
  )
  const height = Math.max(
    0,
    Math.min(previous.bottom, current.bottom) - Math.max(previous.top, current.top)
  )
  const intersection = width * height
  // Durante el cruce, conservar muestras exige continuidad de posición y tamaño.
  return intersection > 0 && intersection >= (area(previous) + area(current) - intersection) / 2
}
