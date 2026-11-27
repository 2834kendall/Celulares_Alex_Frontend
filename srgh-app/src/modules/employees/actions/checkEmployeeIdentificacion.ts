'use server'

import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'

const identificacionSchema = z.string().trim().min(1).max(30)

export type CheckEmployeeIdentificacionResult =
  { ok: true; disponible: boolean } | { ok: false; error: string }

/**
 * Verifica en el paso 1 del wizard si un número de identificación ya existe en
 * `sgrh_empleados` (comparado normalizado: sin guiones, espacios ni mayúsculas) antes de que la persona complete los 4 pasos del alta.
 *
 * Usa `createAdminClient()` a propósito: `sgrh_empleados_emp_numero_identificacion_key`
 * es un índice UNIQUE global sobre toda la tabla, mientras que la policy RLS de
 * sesión (`empleados_select`) solo ve empleados con contrato en la empresa actual,
 * lo que dejaría pasar colisiones globales que luego fallarían con `23505` recién
 * en el paso 4 (`crear_empleado_completo`). Solo devuelve disponibilidad booleana,
 * sin exponer ningún dato personal.
 */
export async function checkEmployeeIdentificacion(
  identificacion: string
): Promise<CheckEmployeeIdentificacionResult> {
  const parsed = identificacionSchema.safeParse(identificacion)
  if (!parsed.success) {
    return { ok: false, error: 'Número de identificación inválido.' }
  }

  await requirePermission(PERMISOS.EMPLEADOS_WRITE)

  // Compara sin guiones, espacios ni mayúsculas ("130000300" = "1-3000-0300"),
  // con la misma regla que el índice único ux_empleados_identificacion_normalizada
  // (SGRH-122). Con el cliente admin la función ve toda la tabla.
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('identificacion_en_uso', { p_numero: parsed.data })

  if (error || typeof data !== 'boolean') {
    return { ok: false, error: 'No se pudo verificar el número de identificación.' }
  }

  return { ok: true, disponible: !data }
}
