'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { FACE_MODEL_ID } from '@/modules/attendance/lib/face/model'

export type GetFaceEnrollmentResult =
  { ok: true; enrolledIds: number[] } | { ok: false; error: string }

/**
 * Ids de empleados con vector facial vigente (del modelo actual). Alimenta
 * la pagina de enrolamiento para marcar quien ya esta registrado. Mismo
 * permiso que enrolar: EMPLEADOS_WRITE.
 */
export async function getFaceEnrollment(): Promise<GetFaceEnrollmentResult> {
  const claims = await requirePermission(PERMISOS.EMPLEADOS_WRITE)
  const meta = claims.app_metadata as { empresa_id?: number }

  if (!meta.empresa_id) {
    return { ok: false, error: 'No se pudo determinar la empresa del usuario.' }
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('sgrh_biometria_empleado')
    .select('bio_empleado_id')
    .eq('bio_empresa_id', meta.empresa_id)
    .eq('bio_modelo', FACE_MODEL_ID)
    .returns<{ bio_empleado_id: number }[]>()

  if (error) {
    return { ok: false, error: 'No se pudo cargar el estado de enrolamiento.' }
  }

  return { ok: true, enrolledIds: (data ?? []).map((r) => r.bio_empleado_id) }
}
