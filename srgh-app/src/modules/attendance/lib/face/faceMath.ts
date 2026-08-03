/**
 * Matematica pura del reconocimiento facial. La comparacion de vectores se
 * hace aca, en TypeScript, iterando los arreglos — NUNCA en la base de datos
 * (pgvector esta prohibido por diseño: los vectores solo se persisten, no se
 * indexan ni se comparan en Postgres).
 *
 * METRICA: distancia EUCLIDEA sobre el descriptor CRUDO, porque asi fue
 * entrenada la red de dlib que usa face-api.js (umbral canonico documentado:
 * 0.6 = "misma persona"). NO usar distancia coseno con este modelo: los
 * descriptores de dlib comparten un componente comun grande entre TODAS las
 * caras (no estan centrados en el origen), asi que el angulo entre dos
 * personas distintas es minusculo — en la practica cualquier par de caras
 * daba distancia coseno < 0.15 y el kiosco aceptaba a cualquiera como el
 * primer enrolado. Ese fue un bug real encontrado en pruebas (2026-07-31).
 * Por la misma razon los vectores NO se L2-normalizan: normalizar destruye
 * la magnitud que la distancia euclidea necesita.
 */

/** Norma L2 de un vector. */
function l2Norm(v: number[]): number {
  let sum = 0
  for (const x of v) sum += x * x
  return Math.sqrt(sum)
}

/**
 * Devuelve el vector normalizado a norma 1 (o el original si es nulo).
 * NO se usa en el pipeline del modelo real (ver nota de metrica arriba);
 * lo usa el embedding de PRUEBA (testEmbedding.ts) para que sus vectores de
 * luminancia queden en una escala comparable entre si.
 */
export function l2Normalize(v: number[]): number[] {
  const norm = l2Norm(v)
  if (norm === 0) return [...v]
  return v.map((x) => x / norm)
}

/**
 * Distancia euclidea entre dos descriptores. Lanza si los largos no calzan:
 * comparar vectores de modelos distintos es un bug del llamador, no un caso
 * a tolerar en silencio.
 */
export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    throw new Error(`Vectores incomparables: largos ${a.length} y ${b.length}.`)
  }
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i]
    sum += d * d
  }
  return Math.sqrt(sum)
}

export type FaceMatchStatus = 'MATCH' | 'REQUIRE_PIN' | 'DENIED'

export interface FaceClassification {
  status: FaceMatchStatus
  /** Solo en MATCH: 'alta' (< 0.4) o 'tolerancia' (0.4 a 0.5, luz/angulo). */
  confianza: 'alta' | 'tolerancia' | null
}

// Umbrales sobre distancia EUCLIDEA de descriptores dlib/face-api.js.
// El punto de referencia es el 0.6 canonico de dlib ("distinta persona");
// las bandas internas son mas estrictas porque en un kiosco con pocos
// empleados un falso MATCH (marcar como OTRO) es mucho peor que pedir PIN:
//   < 0.4        MATCH alta confianza
//   0.4 a 0.5    MATCH con tolerancia (misma persona, luz/angulo)
//   0.5 a 0.6    REQUIRE_PIN (zona de incertidumbre → teclado de PIN)
//   > 0.6        DENIED (persona diferente → log de auditoria)
export const UMBRAL_MATCH_ALTA = 0.4
export const UMBRAL_MATCH = 0.5
export const UMBRAL_PIN = 0.6

export function classifyDistance(distance: number): FaceClassification {
  if (distance < UMBRAL_MATCH_ALTA) return { status: 'MATCH', confianza: 'alta' }
  if (distance < UMBRAL_MATCH) return { status: 'MATCH', confianza: 'tolerancia' }
  if (distance <= UMBRAL_PIN) return { status: 'REQUIRE_PIN', confianza: null }
  return { status: 'DENIED', confianza: null }
}
