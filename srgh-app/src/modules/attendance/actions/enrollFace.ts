'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { decryptVector } from '@/modules/attendance/lib/face/faceCrypto'
import { l2Normalize } from '@/modules/attendance/lib/face/faceMath'
import { FACE_EMBEDDING_DIM, FACE_MODEL_ID } from '@/modules/attendance/lib/face/model'
import { enrollFaceSchema, type EnrollFaceInput } from '@/modules/attendance/types'

export type EnrollFaceResult = { ok: true } | { ok: false; error: string }

/**
 * Enrolamiento: guarda (o reemplaza) el vector facial de un empleado. Solo
 * gerentes (EMPLEADOS_WRITE) — el kiosco no puede escribir vectores, y la
 * pagina /kiosco/enrolar esta gated con el mismo permiso. El vector llega
 * cifrado igual que en la verificacion; aca se descifra, se normaliza L2
 * (forma canonica: la distancia coseno es invariante a escala) y se upserta.
 */
export async function enrollFace(input: EnrollFaceInput): Promise<EnrollFaceResult> {
  const parsed = enrollFaceSchema.safeParse(input)

  if (!parsed.success) {
    return { ok: false, error: 'Datos de enrolamiento invalidos.' }
  }

  const claims = await requirePermission(PERMISOS.EMPLEADOS_WRITE)
  const meta = claims.app_metadata as { usr_id?: number; empresa_id?: number }

  if (!meta.empresa_id) {
    return { ok: false, error: 'No se pudo determinar la empresa del usuario.' }
  }

  const vectorKey = process.env.FACE_VECTOR_KEY
  if (!vectorKey) {
    return { ok: false, error: 'El reconocimiento facial no esta configurado en el servidor.' }
  }

  let vector: number[]
  try {
    vector = await decryptVector(parsed.data.vector, vectorKey)
  } catch {
    return { ok: false, error: 'No se pudo procesar el rostro capturado.' }
  }

  if (vector.length !== FACE_EMBEDDING_DIM) {
    return { ok: false, error: 'No se pudo procesar el rostro capturado.' }
  }

  const supabase = await createClient()

  // El empleado debe tener contrato activo en la empresa del gerente: evita
  // enrolar ids ajenos aunque el RLS de biometria ya limite por empresa.
  const { data: historial } = await supabase
    .from('sgrh_historial_laboral')
    .select('lab_id')
    .eq('lab_empleado_id', parsed.data.employeeId)
    .eq('lab_empresa_id', meta.empresa_id)
    .is('lab_fecha_fin', null)
    .maybeSingle<{ lab_id: number }>()

  if (!historial) {
    return { ok: false, error: 'El empleado no tiene un contrato activo.' }
  }

  const { error } = await supabase.from('sgrh_biometria_empleado').upsert(
    {
      bio_empleado_id: parsed.data.employeeId,
      bio_empresa_id: meta.empresa_id,
      bio_vector: l2Normalize(vector),
      bio_modelo: FACE_MODEL_ID,
      bio_creado_por: meta.usr_id ?? null,
      bio_updated_at: new Date().toISOString(),
    },
    { onConflict: 'bio_empleado_id' }
  )

  if (error) {
    return { ok: false, error: 'No se pudo guardar el registro facial.' }
  }

  return { ok: true }
}
