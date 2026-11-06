'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { FACE_MODEL_ID } from '@/modules/attendance/lib/face/model'

export type FaceStatus =
  | { enrolled: false }
  | {
      enrolled: true
      /** Última captura (ISO). Re-enrolar la actualiza. */
      updatedAt: string
      /**
       * false = el vector es de un modelo anterior. El kiosco filtra por
       * bio_modelo y nunca lo compararía, así que para el kiosco esa persona
       * no está registrada: hay que capturar de nuevo.
       */
      currentModel: boolean
    }

export type GetFaceStatusResult = { ok: true; status: FaceStatus } | { ok: false; error: string }

const empIdSchema = z.number().int().positive()

/**
 * Estado del registro facial de UN empleado, para el tab Rostro del perfil.
 * Mismo permiso que enrolar (BIOMETRIA_WRITE): el tab solo existe para quien
 * puede actuar sobre él. La RLS de sgrh_biometria_empleado limita al gerente
 * al personal de su sucursal.
 */
export async function getFaceStatus(empId: number): Promise<GetFaceStatusResult> {
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
    .select('bio_modelo, bio_updated_at')
    .eq('bio_empleado_id', parsed.data)
    .eq('bio_empresa_id', meta.empresa_id)
    .maybeSingle<{ bio_modelo: string; bio_updated_at: string }>()

  if (error) {
    return { ok: false, error: 'No se pudo cargar el registro facial.' }
  }

  if (!data) {
    return { ok: true, status: { enrolled: false } }
  }

  return {
    ok: true,
    status: {
      enrolled: true,
      updatedAt: data.bio_updated_at,
      currentModel: data.bio_modelo === FACE_MODEL_ID,
    },
  }
}
