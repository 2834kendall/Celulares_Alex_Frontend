/** Recorta "HH:mm:ss" (formato de la columna time de Postgres) a "HH:mm". */
export function stripSeconds(time: string): string
export function stripSeconds(time: string | null | undefined): string | null | undefined
export function stripSeconds(time: string | null | undefined) {
  return time ? time.slice(0, 5) : time
}
