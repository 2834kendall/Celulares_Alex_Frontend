/**
 * Hora de entrada esperada del SEGUNDO bloque de un dia (SGRH-110, jornada
 * partida o un tramo por sucursal), o null si el dia tiene un solo bloque.
 *
 * Recibe las horas de inicio de todos los bloques programados del dia, en
 * cualquier orden: las del tramo (propia o de la plantilla) y, si la plantilla
 * es partida, la de su segundo bloque. Son "HH:mm", asi que ordenarlas como
 * texto es ordenarlas por hora.
 *
 * Solo hay segundo bloque: la primera entrada se mide contra el primero, como
 * siempre, y un tercero no existe en el modelo (una plantilla trae dos
 * bloques, y un tramo con horas propias es uno).
 */
export function secondBlockStart(starts: (string | null | undefined)[]): string | null {
  const ordered = starts.filter((s): s is string => Boolean(s)).sort()
  return ordered[1] ?? null
}
