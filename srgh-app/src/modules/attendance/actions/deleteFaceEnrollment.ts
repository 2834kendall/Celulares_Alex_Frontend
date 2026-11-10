'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'

export type DeleteFaceEnrollmentResult = { ok: true } | { ok: false; error: string }

const empIdSchema = z.number().int().positive()

/**
 * Borra el registro facial de un empleado: desde ese momento el kiosco ya no
 * lo reconoce. Para cuando el colaborador retira su consentimiento o la
 * captura quedó mala.
 *
 * Pide `.select()` sobre lo borrado y trata 0 filas como error: un DELETE que
 * la RLS filtra (otra sucursal, otra empresa) NO falla, simplemente no borra
 * nada, y sin esto la pantalla diría "eliminado" con el vector intacto.
 */
export async function deleteFaceEnrollment(empId: number): Promise<DeleteFaceEnrollmentResult> {
  const parsed = empIdSchema.safeParse(empId)
  if (!parsed.success) {
    return { ok: false, error: 'Empleado inválido.' }
  }

  const claims = await requirePermission(PERMISOS.BIOMETRIA_WRITE)
  const meta = claims.app_metadata as { empresa_id?: number }

  if (!meta.empresa_id) {
    return { ok: false, error: 'No se pudo determinar la empresa del usuario.' }
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('sgrh_biometria_empleado')
    .delete()
    .eq('bio_empleado_id', parsed.data)
    .eq('bio_empresa_id', meta.empresa_id)
    .select('bio_id')

  if (error) {
    return { ok: false, error: 'No se pudo eliminar el registro facial.' }
  }

  if (!data || data.length === 0) {
    return {
      ok: false,
      error: 'No se encontró un registro facial de este empleado que pueda eliminar.',
    }
  }

  revalidatePath(`/employees/${parsed.data}`)
  return { ok: true }
}
