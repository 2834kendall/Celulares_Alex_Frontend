/**
 * Matematica pura del reconocimiento facial. La comparacion de vectores se
 * hace aca, en TypeScript, iterando los arreglos — NUNCA en la base de datos
 * (pgvector esta prohibido por diseño: los vectores solo se persisten, no se
 * indexan ni se comparan en Postgres).
 */

/** Norma L2 de un vector. */
function l2Norm(v: number[]): number {
  let sum = 0
  for (const x of v) sum += x * x
  return Math.sqrt(sum)
}

/** Devuelve el vector normalizado a norma 1 (o el original si es nulo). */
export function l2Normalize(v: number[]): number[] {
  const norm = l2Norm(v)
  if (norm === 0) return [...v]
  return v.map((x) => x / norm)
}

/**
 * Distancia coseno: 1 - similitud coseno. 0 = identicos, 1 = ortogonales,
 * 2 = opuestos. Lanza si los largos no calzan: comparar vectores de modelos
 * distintos es un bug del llamador, no un caso a tolerar en silencio.
 */
export function cosineDistance(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    throw new Error(`Vectores incomparables: largos ${a.length} y ${b.length}.`)
  }
  let dot = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
  }
  const normA = l2Norm(a)
  const normB = l2Norm(b)
  if (normA === 0 || normB === 0) return 1
  return 1 - dot / (normA * normB)
}

export type FaceMatchStatus = 'MATCH' | 'REQUIRE_PIN' | 'DENIED'

export interface FaceClassification {
  status: FaceMatchStatus
  /** Solo en MATCH: 'alta' (< 0.3) o 'tolerancia' (0.3 a 0.5, luz/angulo). */
  confianza: 'alta' | 'tolerancia' | null
}

// Umbrales EXACTOS del diseño (distancia coseno):
//   < 0.3        MATCH alta confianza
//   0.3 a 0.5    MATCH con tolerancia (misma persona, luz/angulo)
//   0.5 a 0.7    REQUIRE_PIN (zona de incertidumbre → teclado de PIN)
//   > 0.7        DENIED (persona diferente → log de auditoria)
export const UMBRAL_MATCH_ALTA = 0.3
export const UMBRAL_MATCH = 0.5
export const UMBRAL_PIN = 0.7

export function classifyDistance(distance: number): FaceClassification {
  if (distance < UMBRAL_MATCH_ALTA) return { status: 'MATCH', confianza: 'alta' }
  if (distance < UMBRAL_MATCH) return { status: 'MATCH', confianza: 'tolerancia' }
  if (distance <= UMBRAL_PIN) return { status: 'REQUIRE_PIN', confianza: null }
  return { status: 'DENIED', confianza: null }
}
