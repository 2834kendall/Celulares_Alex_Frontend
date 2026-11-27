import { euclideanDistance, UMBRAL_MATCH_ALTA } from './faceMath'
import { FACE_EMBEDDING_DIM } from './model'

/**
 * Las tres tomas del registro tienen que ser la MISMA cara con holgura: entre
 * cualquier par, menos que la coincidencia "alta" del kiosco (SGRH-117). Antes
 * se usaba la coincidencia comun (0.5), que deja pasar tomas en las que algo
 * cambio a mitad de captura (un movimiento, una sombra, el pelo, una mano
 * fugaz) y produce un registro que despues el kiosco reconoce con dudas.
 *
 * No atrapa algo que tape la cara TODO el tiempo (lentes oscuros puestos): esas
 * tomas salen parecidas entre si. Eso lo frenan los controles de imagen.
 */
export const ENROLLMENT_MAX_SPREAD = UMBRAL_MATCH_ALTA

/** Mensaje para la persona cuando las tomas no coinciden entre si. */
export const ENROLLMENT_INCONSISTENT_MESSAGE =
  'Las tomas salieron distintas entre sí. Quedate quieto, de frente, e intentá de nuevo.'

export class InconsistentEnrollmentError extends Error {
  constructor() {
    super(ENROLLMENT_INCONSISTENT_MESSAGE)
    this.name = 'InconsistentEnrollmentError'
  }
}

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
      if (d >= ENROLLMENT_MAX_SPREAD) throw new InconsistentEnrollmentError()
      totals[i] += d
      totals[j] += d
    }
  }
  return samples[totals.indexOf(Math.min(...totals))]
}
