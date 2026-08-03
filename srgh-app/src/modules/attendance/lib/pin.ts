/**
 * PIN de respaldo del kiosco cuando la camara falla: el año de nacimiento
 * (YYYY) del empleado. Es deliberadamente debil y se acepta asi solo mientras
 * no exista reconocimiento facial real (fuera de este ticket) — ver la
 * decision registrada para SGRH-21. emp_fecha_nacimiento es opcional en la
 * tabla, asi que un empleado sin esa fecha no puede usar este fallback.
 */
export function isValidPin(pin: string, birthDateISO: string | null): boolean {
  if (!birthDateISO) return false
  if (!/^\d{4}$/.test(pin)) return false
  return pin === birthDateISO.slice(0, 4)
}
