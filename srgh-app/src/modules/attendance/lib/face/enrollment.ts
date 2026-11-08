import { euclideanDistance, UMBRAL_MATCH } from './faceMath'
import { FACE_EMBEDDING_DIM } from './model'

/** Choose a real sample (medoid), not a normalized or synthetic descriptor. */
export function enrollmentMedoid(samples: number[][]): number[] {
  if (
    samples.length !== 3 ||
    samples.some((s) => s.length !== FACE_EMBEDDING_DIM || !s.every(Number.isFinite))
  ) {
    throw new Error('Se requieren tres capturas validas.')
  }
  const totals = samples.map(() => 0)
  for (let i = 0; i < samples.length; i++) {
    for (let j = i + 1; j < samples.length; j++) {
      const d = euclideanDistance(samples[i], samples[j])
      // Reuse the current identity threshold; do not relax recognition.
      if (d >= UMBRAL_MATCH) throw new Error('Las capturas no son consistentes. Intenta de nuevo.')
      totals[i] += d
      totals[j] += d
    }
  }
  return samples[totals.indexOf(Math.min(...totals))]
}
