/**
 * Prueba de vida que viaja del kiosco al servidor junto con el embedding.
 *
 * POR QUE VA DENTRO DEL PAYLOAD CIFRADO y no como un campo suelto: asi queda
 * ligada criptograficamente (AES-GCM autentica ademas de cifrar) al MISMO
 * vector que se esta verificando. Un campo aparte se podria recombinar —
 * mandar el vector de una foto con la prueba de vida de otra captura.
 *
 * HASTA DONDE LLEGA ESTA GARANTIA — sin adornos: la llave AES esta expuesta al
 * cliente por necesidad (NEXT_PUBLIC_FACE_VECTOR_KEY) y faceCrypto ya lo
 * documenta. Quien controle la tablet y sepa lo suficiente puede fabricar un
 * payload con la prueba que quiera. Lo que ESTO si cierra:
 *   - que el veredicto quede solo en el cliente y el servidor firme tickets a
 *     ciegas (que es como esta hoy);
 *   - la recombinacion vector/prueba descrita arriba;
 *   - el bypass accidental por un cambio futuro en el frontend.
 * Es defensa en profundidad y trazabilidad, no una garantia criptografica
 * frente al dueno del dispositivo. Cerrar eso de verdad exige atestacion de
 * dispositivo, que esta fuera del alcance de un kiosco en navegador.
 */

export type LivenessMethod =
  /** Analisis de material del rostro (antispoof.ts, MiniFASNetV2). */
  'textura'

export interface LivenessProof {
  method: LivenessMethod
  /**
   * Probabilidad de rostro real (0..1) que devolvio el clasificador: la
   * MEDIANA de las mediciones por frame, no una lectura suelta.
   */
  score: number
  /** Cuantos frames se evaluaron para llegar a esa mediana. */
  samples: number
}

const METHODS: readonly LivenessMethod[] = ['textura']

/**
 * Valida la forma de la prueba recibida. NO valida que sea cierta —eso es
 * imposible desde el servidor, ver la nota de arriba—; descarta payloads
 * malformados y deja el veredicto en un tipo confiable para el resto del
 * codigo.
 */
export function isLivenessProof(value: unknown): value is LivenessProof {
  if (typeof value !== 'object' || value === null) return false
  const proof = value as Record<string, unknown>

  if (!METHODS.includes(proof.method as LivenessMethod)) return false

  const { score, samples } = proof
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1) return false
  if (typeof samples !== 'number' || !Number.isInteger(samples) || samples < 1) return false

  return true
}
