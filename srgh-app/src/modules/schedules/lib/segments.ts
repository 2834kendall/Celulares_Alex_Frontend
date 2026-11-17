/**
 * Un dia puede tener varios tramos (SGRH-110): por ejemplo 8-12 en una
 * sucursal y 13-17 en otra. El dia describe su PRIMER tramo y los demas
 * viajan en `extraTramos`, asi que quien solo conoce un tramo por dia sigue
 * funcionando. Estos helpers evitan repetir `[day, ...(day.extraTramos ?? [])]`.
 */

/** Todos los tramos del dia, el primero primero (el que empieza antes). */
export function tramosOf<T extends { extraTramos?: T[] }>(day: T): T[] {
  return [day, ...(day.extraTramos ?? [])]
}

/** Horas del dia: la suma de todos sus tramos. */
export function dayHours<T extends { hours: number; extraTramos?: T[] }>(day: T): number {
  return tramosOf(day).reduce((total, tramo) => total + tramo.hours, 0)
}
