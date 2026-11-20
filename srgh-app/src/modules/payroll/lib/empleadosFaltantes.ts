/**
 * Empleados activos de un periodo de toda la empresa que todavía no tienen
 * fila. Es lo que avisa la pantalla del periodo y lo que agrega el botón
 * "Agregar empleados que falten" (cargarEmpleadosDesdeAsistencia): los dos
 * miran el mismo alcance (lib/alcancePlanilla.ts) y la misma lista de activos.
 *
 * Sin `server-only`: lo usan la pantalla y sus pruebas. La lectura de los activos
 * está en empleadosFaltantesData.ts.
 */

/** Cuántos nombres se muestran en el aviso; el resto va como "y N más". */
export const MAX_NOMBRES_FALTANTES = 8

export interface EmpleadosQueFaltan {
  total: number
  /** Los primeros, por orden alfabético (hasta MAX_NOMBRES_FALTANTES). */
  nombres: string[]
}

/** Quiénes de `activos` no están en `conFila` (ids de contrato). */
export function empleadosQueFaltan(
  activos: { labId: number; nombre: string }[],
  conFila: Iterable<number>
): EmpleadosQueFaltan {
  const yaEstan = new Set(conFila)
  const faltan = activos.filter((e) => !yaEstan.has(e.labId)).map((e) => e.nombre)
  faltan.sort((a, b) => a.localeCompare(b, 'es'))
  return { total: faltan.length, nombres: faltan.slice(0, MAX_NOMBRES_FALTANTES) }
}
