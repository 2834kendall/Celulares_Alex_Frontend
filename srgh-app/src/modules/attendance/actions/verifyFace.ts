'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { decryptVector } from '@/modules/attendance/lib/face/faceCrypto'
import { classifyDistance, euclideanDistance } from '@/modules/attendance/lib/face/faceMath'
import { signFaceTicket } from '@/modules/attendance/lib/face/faceTicket'
import { FACE_EMBEDDING_DIM, FACE_MODEL_ID } from '@/modules/attendance/lib/face/model'
import { verifyFaceSchema, type VerifyFaceInput } from '@/modules/attendance/types'

export type VerifyFaceResult =
  | {
      ok: true
      status: 'MATCH'
      employeeId: number
      fullName: string
      confianza: 'alta' | 'tolerancia'
      /** Prueba firmada para que registerKioskMark guarde la marca como FACIAL. */
      ticket: string
    }
  | { ok: true; status: 'REQUIRE_PIN' }
  | { ok: true; status: 'DENIED' }
  | { ok: false; error: string }

interface HistorialRow {
  lab_empleado_id: number
  sgrh_empleados: {
    emp_nombre: string
    emp_apellido_1: string
    emp_apellido_2: string | null
  } | null
}

interface BiometriaRow {
  bio_empleado_id: number
  bio_vector: unknown
}

/**
 * Identificacion facial 1:N del kiosco. Recibe el embedding CIFRADO (la foto
 * nunca llega aca), lo descifra, baja de la base de datos unicamente los
 * vectores de los empleados activos de la sucursal del kiosco y calcula la
 * distancia euclidea en TypeScript puro — cero pgvector, cero SQL de
 * similitud, por diseño (y euclidea, NO coseno: ver faceMath.ts).
 *
 * Estados segun la mejor distancia: MATCH (< 0.5, con confianza alta si
 * < 0.4), REQUIRE_PIN (0.5 a 0.6: el frontend abre el teclado de PIN) y
 * DENIED (> 0.6: se guarda log de auditoria). Sin vectores enrolados en la
 * sucursal se responde REQUIRE_PIN: identidad no verificable ≠ intruso.
 */
export async function verifyFace(input: VerifyFaceInput): Promise<VerifyFaceResult> {
  const parsed = verifyFaceSchema.safeParse(input)

  if (!parsed.success) {
    return { ok: false, error: 'Datos de verificacion invalidos.' }
  }

  const claims = await requirePermission(PERMISOS.ASISTENCIA_WRITE)
  const meta = claims.app_metadata as { usr_id?: number; empresa_id?: number }

  if (!meta.empresa_id) {
    return { ok: false, error: 'No se pudo determinar la empresa del kiosco.' }
  }

  const vectorKey = process.env.FACE_VECTOR_KEY
  const ticketSecret = process.env.FACE_TICKET_SECRET
  if (!vectorKey || !ticketSecret) {
    return { ok: false, error: 'El reconocimiento facial no esta configurado en el servidor.' }
  }

  let probe: number[]
  try {
    probe = await decryptVector(parsed.data.vector, vectorKey)
  } catch {
    return { ok: false, error: 'No se pudo procesar la verificacion facial.' }
  }

  if (probe.length !== FACE_EMBEDDING_DIM) {
    return { ok: false, error: 'No se pudo procesar la verificacion facial.' }
  }

  const supabase = await createClient()

  let sucursalId: number | null = null
  if (meta.usr_id) {
    const { data: asignacion } = await supabase
      .from('sgrh_usuarios_empresa_rol')
      .select('uer_sucursal_id')
      .eq('uer_usuario_id', meta.usr_id)
      .eq('uer_activo', true)
      .maybeSingle<{ uer_sucursal_id: number | null }>()
    sucursalId = asignacion?.uer_sucursal_id ?? null
  }

  if (sucursalId === null) {
    return { ok: false, error: 'Este kiosco no tiene una sucursal asignada.' }
  }

  const { data: historial, error: errHistorial } = await supabase
    .from('sgrh_historial_laboral')
    .select(
      `
      lab_empleado_id,
      sgrh_empleados ( emp_nombre, emp_apellido_1, emp_apellido_2 )
    `
    )
    .eq('lab_empresa_id', meta.empresa_id)
    .eq('lab_sucursal_id', sucursalId)
    .is('lab_fecha_fin', null)
    .returns<HistorialRow[]>()

  if (errHistorial) {
    return { ok: false, error: 'No se pudieron cargar los colaboradores.' }
  }

  const nameByEmployee = new Map<number, string>()
  for (const h of historial ?? []) {
    const e = h.sgrh_empleados
    if (!e) continue
    nameByEmployee.set(
      h.lab_empleado_id,
      `${e.emp_nombre} ${e.emp_apellido_1}${e.emp_apellido_2 ? ' ' + e.emp_apellido_2 : ''}`
    )
  }

  if (nameByEmployee.size === 0) {
    return { ok: true, status: 'REQUIRE_PIN' }
  }

  const { data: vectores, error: errVectores } = await supabase
    .from('sgrh_biometria_empleado')
    .select('bio_empleado_id, bio_vector')
    .in('bio_empleado_id', Array.from(nameByEmployee.keys()))
    .eq('bio_modelo', FACE_MODEL_ID)
    .returns<BiometriaRow[]>()

  if (errVectores) {
    return { ok: false, error: 'No se pudieron cargar los datos biometricos.' }
  }

  let bestEmployeeId: number | null = null
  let bestDistance = Number.POSITIVE_INFINITY

  for (const row of vectores ?? []) {
    const stored = row.bio_vector
    if (!Array.isArray(stored) || stored.length !== FACE_EMBEDDING_DIM) continue
    if (!stored.every((x) => typeof x === 'number')) continue

    const distance = euclideanDistance(probe, stored)
    if (distance < bestDistance) {
      bestDistance = distance
      bestEmployeeId = row.bio_empleado_id
    }
  }

  // Nadie enrolado (o solo vectores de un modelo viejo/corruptos): zona de
  // incertidumbre, no un rechazo — el kiosco cae al flujo de nombre + PIN.
  if (bestEmployeeId === null) {
    return { ok: true, status: 'REQUIRE_PIN' }
  }

  const clasificacion = classifyDistance(bestDistance)

  if (clasificacion.status === 'DENIED') {
    // Log de auditoria obligatorio en DENIED. Best-effort: si el insert
    // falla no se le esconde el resultado al kiosco, pero tampoco se miente
    // con un MATCH.
    await supabase.from('sgrh_biometria_auditoria').insert({
      bia_empresa_id: meta.empresa_id,
      bia_sucursal_id: sucursalId,
      bia_resultado: 'DENIED',
      bia_mejor_distancia: Number(bestDistance.toFixed(4)),
      bia_mejor_empleado_id: bestEmployeeId,
      bia_dispositivo_id: parsed.data.dispositivoId,
    })
    return { ok: true, status: 'DENIED' }
  }

  if (clasificacion.status === 'REQUIRE_PIN') {
    return { ok: true, status: 'REQUIRE_PIN' }
  }

  return {
    ok: true,
    status: 'MATCH',
    employeeId: bestEmployeeId,
    fullName: nameByEmployee.get(bestEmployeeId) ?? '',
    confianza: clasificacion.confianza ?? 'tolerancia',
    ticket: await signFaceTicket(bestEmployeeId, ticketSecret),
  }
}
