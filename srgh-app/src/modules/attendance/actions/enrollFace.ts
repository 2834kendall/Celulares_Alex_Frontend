'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { euclideanDistance, UMBRAL_MATCH } from '@/modules/attendance/lib/face/faceMath'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { decryptFacePayload } from '@/modules/attendance/lib/face/faceCrypto'
import { isLivenessProof } from '@/modules/attendance/lib/face/livenessProof'
import { FACE_EMBEDDING_DIM, FACE_MODEL_ID } from '@/modules/attendance/lib/face/model'
import { enrollFaceSchema, type EnrollFaceInput } from '@/modules/attendance/types'

export type EnrollFaceResult = { ok: true } | { ok: false; error: string }

/** Valor de `bia_resultado` cuando se rechaza un registro por parecido. */
const DUPLICATE_AUDIT_RESULT = 'ENROLL_DUPLICADO'

interface StoredVectorRow {
  bio_empleado_id: number
  bio_vector: unknown
}

/**
 * Unicidad (SGRH-117): el rostro nuevo no puede parecerse al de OTRO
 * colaborador de la empresa tanto como para que el kiosco los confunda. Se
 * usa el mismo umbral que el kiosco da por coincidencia (UMBRAL_MATCH): si a
 * esa distancia hay otra persona, ese registro marcaria asistencia a nombre
 * equivocado, que es el error que termina en la nomina.
 *
 * Corre en el servidor, que ya descifra el vector: no depende de nada que el
 * navegador pueda saltarse, y los rostros de los demas nunca salen de aca. Usa
 * el cliente admin porque la RLS limita al gerente a su sucursal, y el
 * parecido importa en toda la empresa (un traslado lo pone frente a otro
 * kiosco). El propio colaborador se excluye: reemplazar su registro es normal.
 *
 * Devuelve el colaborador mas parecido bajo el umbral, null si no hay, o
 * 'error' si no se pudo leer (y entonces no se guarda: falla cerrado).
 */
async function findSimilarFace(
  empresaId: number,
  employeeId: number,
  vector: number[]
): Promise<{ employeeId: number; distance: number } | null | 'error'> {
  const { data, error } = await createAdminClient()
    .from('sgrh_biometria_empleado')
    .select('bio_empleado_id, bio_vector')
    .eq('bio_empresa_id', empresaId)
    .eq('bio_modelo', FACE_MODEL_ID)
    .neq('bio_empleado_id', employeeId)
    .returns<StoredVectorRow[]>()

  if (error) return 'error'

  let closest: { employeeId: number; distance: number } | null = null
  for (const row of data ?? []) {
    const stored = row.bio_vector
    if (!Array.isArray(stored) || stored.length !== FACE_EMBEDDING_DIM) continue
    if (!stored.every((x) => typeof x === 'number' && Number.isFinite(x))) continue
    const distance = euclideanDistance(vector, stored)
    if (distance < UMBRAL_MATCH && (!closest || distance < closest.distance)) {
      closest = { employeeId: row.bio_empleado_id, distance }
    }
  }
  return closest
}

/**
 * Enrolamiento: guarda (o reemplaza) el vector facial de un empleado, desde el
 * tab Rostro de su perfil. Pide BIOMETRIA_WRITE (ADMIN y GERENTE, SGRH-102):
 * antes pedia EMPLEADOS_WRITE, que el gerente no tiene, asi que solo el ADMIN
 * podia enrolar. La RLS limita al gerente al personal de su sucursal y el
 * kiosco no puede escribir vectores. El vector llega
 * cifrado igual que en la verificacion; aca se descifra y se upserta TAL
 * CUAL (sin normalizar: la distancia euclidea de dlib necesita la magnitud
 * original del descriptor — ver faceMath.ts).
 *
 * EXIGE PRUEBA DE VIDA, al mismo nivel que el kiosco (SGRH-80). Antes de eso
 * se podia REGISTRAR a una persona a partir de una fotografia, y un
 * enrolamiento envenenado no caduca: deja a ese colaborador suplantable de
 * forma permanente y es mucho mas dificil de detectar despues que una marca
 * fraudulenta suelta.
 */
export async function enrollFace(input: EnrollFaceInput): Promise<EnrollFaceResult> {
  const parsed = enrollFaceSchema.safeParse(input)

  if (!parsed.success) {
    return { ok: false, error: 'Datos de enrolamiento invalidos.' }
  }

  const claims = await requirePermission(PERMISOS.BIOMETRIA_WRITE)
  const meta = claims.app_metadata as { usr_id?: number; empresa_id?: number }

  if (!meta.empresa_id) {
    return { ok: false, error: 'No se pudo determinar la empresa del usuario.' }
  }

  const vectorKey = process.env.FACE_VECTOR_KEY
  if (!vectorKey) {
    return { ok: false, error: 'El reconocimiento facial no está configurado en el servidor.' }
  }

  let vector: number[]
  let liveness: unknown
  try {
    const payload = await decryptFacePayload(parsed.data.vector, vectorKey)
    vector = payload.vector
    liveness = payload.liveness
  } catch {
    return { ok: false, error: 'No se pudo procesar el rostro capturado.' }
  }

  if (vector.length !== FACE_EMBEDDING_DIM) {
    return { ok: false, error: 'No se pudo procesar el rostro capturado.' }
  }

  if (!isLivenessProof(liveness)) {
    return {
      ok: false,
      error: 'No se pudo confirmar que haya una persona real frente a la cámara.',
    }
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

  const duplicate = await findSimilarFace(meta.empresa_id, parsed.data.employeeId, vector)
  if (duplicate === 'error') {
    return { ok: false, error: 'No se pudo comprobar el registro facial. Intentá de nuevo.' }
  }
  if (duplicate) {
    // Best-effort, como el DENIED del kiosco: si el log falla, el rechazo
    // se mantiene igual.
    await createAdminClient()
      .from('sgrh_biometria_auditoria')
      .insert({
        bia_empresa_id: meta.empresa_id,
        bia_resultado: DUPLICATE_AUDIT_RESULT,
        bia_mejor_distancia: Number(duplicate.distance.toFixed(4)),
        bia_mejor_empleado_id: duplicate.employeeId,
        // Perfil en el que se intento registrar y quien lo intento: la columna
        // de dispositivo es texto libre y el registro no tiene dispositivo.
        bia_dispositivo_id: `registro:${parsed.data.employeeId}:usr:${meta.usr_id ?? '-'}`,
      })
      .then(
        () => undefined,
        () => undefined
      )
    return {
      ok: false,
      error:
        'Este rostro se parece demasiado al de otro colaborador ya registrado. Revisá que sea la persona correcta y, si lo es, consultá con RRHH.',
    }
  }

  const { error } = await supabase.from('sgrh_biometria_empleado').upsert(
    {
      bio_empleado_id: parsed.data.employeeId,
      bio_empresa_id: meta.empresa_id,
      bio_vector: vector,
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
