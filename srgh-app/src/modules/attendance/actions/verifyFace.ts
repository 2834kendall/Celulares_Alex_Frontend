'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireKioskAccess } from '@/modules/attendance/lib/kioskAccess'
import type { ManagedKioskMeta } from '@/modules/attendance/lib/liveKioskAccess'
import { resolveKioskSucursalIds } from '@/modules/attendance/lib/dayJourney'
import { getDayAssignments, isWorkable } from '@/modules/attendance/lib/workingDay'
import { todayInCostaRica } from '@/modules/attendance/lib/time'
import { decryptFacePayload } from '@/modules/attendance/lib/face/faceCrypto'
import { isLivenessProof } from '@/modules/attendance/lib/face/livenessProof'
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

const uncertain = { ok: true, status: 'REQUIRE_PIN' } as const

/**
 * Identificacion facial 1:N del kiosco. Recibe el embedding CIFRADO (la foto
 * nunca llega aca), lo descifra, baja de la base de datos unicamente los
 * vectores de los empleados activos de la sucursal del kiosco y calcula la
 * distancia euclidea en TypeScript puro — cero pgvector, cero SQL de
 * similitud, por diseño (y euclidea, NO coseno: ver faceMath.ts).
 *
 * Estados segun la mejor distancia: MATCH (< 0.5, con confianza alta si
 * < 0.4), REQUIRE_PIN (0.5 a 0.6: el frontend abre el teclado de PIN) y
 * DENIED (> 0.6). Sin vectores enrolados en la
 * sucursal se responde REQUIRE_PIN: identidad no verificable ≠ intruso.
 */
export async function verifyFace(input: VerifyFaceInput): Promise<VerifyFaceResult> {
  const parsed = verifyFaceSchema.safeParse(input)

  if (!parsed.success) {
    return { ok: false, error: 'Datos de verificación inválidos.' }
  }

  const claims = await requireKioskAccess()
  const meta = claims.app_metadata as ManagedKioskMeta
  if (meta.kiosk_error) return { ok: false, error: meta.kiosk_error }

  const companyId = meta.empresa_id
  if (!companyId) {
    return { ok: false, error: 'No se pudo determinar la empresa del kiosco.' }
  }

  const vectorKey = process.env.FACE_VECTOR_KEY
  const ticketSecret = process.env.FACE_TICKET_SECRET
  if (!vectorKey || !ticketSecret) {
    return { ok: false, error: 'El reconocimiento facial no está configurado en el servidor.' }
  }

  let probe: number[]
  let liveness: unknown
  try {
    const payload = await decryptFacePayload(parsed.data.vector, vectorKey)
    probe = payload.vector
    liveness = payload.liveness
  } catch {
    return { ok: false, error: 'No se pudo procesar la verificación facial.' }
  }

  if (probe.length !== FACE_EMBEDDING_DIM) {
    return { ok: false, error: 'No se pudo procesar la verificación facial.' }
  }

  const { dispositivoId, metricas } = parsed.data
  const audit = async (
    result: Extract<VerifyFaceResult, { ok: true }>,
    branchId: number | null,
    admin?: ReturnType<typeof createAdminClient>,
    candidate?: { employeeId: number; distance: number }
  ): Promise<VerifyFaceResult> => {
    try {
      await (admin ?? createAdminClient()).from('sgrh_biometria_auditoria').insert({
        bia_empresa_id: companyId,
        bia_sucursal_id: branchId,
        bia_resultado: result.status,
        bia_mejor_distancia: candidate ? Number(candidate.distance.toFixed(4)) : null,
        bia_mejor_empleado_id: candidate?.employeeId ?? null,
        bia_dispositivo_id: dispositivoId,
        bia_escaneo_ms: metricas?.escaneoMs ?? null,
        bia_fps: metricas?.fps ?? null,
      })
    } catch {
      // Un fallo de auditoría no debe cambiar el resultado ni frenar la fila.
    }
    return result
  }

  // Sin prueba de vida NO se emite ticket. Reconocer de quien es una cara y
  // verificar si esa cara esta viva son preguntas distintas: sin esta guarda,
  // una foto del colaborador da distancia baja —correctamente, es la misma
  // cara— y el kiosco firmaria una marca FACIAL. Ver livenessProof.ts para el
  // alcance real de esta garantia.
  if (!isLivenessProof(liveness)) {
    return audit(uncertain, meta.sucursal_ids?.[0] ?? null)
  }

  const supabase = await createClient()

  const sucursalIds = await resolveKioskSucursalIds(supabase, meta)

  if (!sucursalIds || sucursalIds.length === 0) {
    return { ok: false, error: 'Este kiosco no tiene una sucursal asignada.' }
  }

  // El set de candidatos es quien trabaja HOY aca, no quien tiene esta
  // sucursal en su contrato: desde SGRH-84 el gerente puede trasladar a
  // alguien un dia puntual, y con el filtro viejo (lab_sucursal_id) su cara
  // ni siquiera entraba a la comparacion — el kiosco lo mandaba al PIN, y el
  // selector del PIN tampoco lo listaba: quedaba sin poder marcar.
  //
  // Acotar el set al dia tiene un segundo efecto deseable: menos vectores
  // contra los que comparar es menos superficie para un falso positivo.
  // Programacion, contratos, rostros y auditoria con el cliente admin: la
  // cuenta KIOSCO no puede leer ni escribir esas tablas (ver
  // lib/kioskAccess.ts). Todo acotado a las sucursales de la cuenta y a la
  // empresa del JWT.
  const admin = createAdminClient()
  const branchId = sucursalIds[0]
  const assignments = await getDayAssignments(admin, todayInCostaRica(), sucursalIds)

  if (!assignments.ok) {
    return { ok: false, error: assignments.error }
  }

  const historyIds = assignments.data.filter(isWorkable).map((a) => a.employmentHistoryId)

  // Nadie programado hoy aca: no hay contra quien comparar. Mismo trato que
  // 'nadie enrolado' — se cae al PIN, que igual va a rebotar en
  // registerKioskMark si de verdad no le toca trabajar.
  if (historyIds.length === 0) {
    return audit(uncertain, branchId, admin)
  }

  const { data: historial, error: errHistorial } = await admin
    .from('sgrh_historial_laboral')
    .select(
      `
      lab_empleado_id,
      sgrh_empleados ( emp_nombre, emp_apellido_1, emp_apellido_2 )
    `
    )
    // Ademas del nombre, este cruce acota por empresa y descarta contratos ya
    // cerrados: la programacion queda como historico y sobrevive a la salida
    // del colaborador.
    .in('lab_id', historyIds)
    .eq('lab_empresa_id', companyId)
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
    return audit(uncertain, branchId, admin)
  }

  const { data: vectores, error: errVectores } = await admin
    .from('sgrh_biometria_empleado')
    .select('bio_empleado_id, bio_vector')
    .eq('bio_empresa_id', companyId)
    .in('bio_empleado_id', Array.from(nameByEmployee.keys()))
    .eq('bio_modelo', FACE_MODEL_ID)
    .returns<BiometriaRow[]>()

  if (errVectores) {
    return { ok: false, error: 'No se pudieron cargar los datos biométricos.' }
  }

  let bestEmployeeId: number | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  let secondDistance = Number.POSITIVE_INFINITY

  for (const row of vectores ?? []) {
    const stored = row.bio_vector
    if (!Array.isArray(stored) || stored.length !== FACE_EMBEDDING_DIM) continue
    if (!stored.every((x) => typeof x === 'number' && Number.isFinite(x))) continue

    const distance = euclideanDistance(probe, stored)
    if (distance < bestDistance) {
      secondDistance = bestDistance
      bestDistance = distance
      bestEmployeeId = row.bio_empleado_id
    } else if (distance < secondDistance) {
      secondDistance = distance
    }
  }

  // Nadie enrolado (o solo vectores de un modelo viejo/corruptos): zona de
  // incertidumbre, no un rechazo — el kiosco cae al flujo de nombre + PIN.
  if (bestEmployeeId === null) {
    return audit(uncertain, branchId, admin)
  }

  const clasificacion = classifyDistance(bestDistance)
  const candidate = { employeeId: bestEmployeeId, distance: bestDistance }

  // A second identity also passing today's MATCH threshold is ambiguous.
  // Do not invent a new uncalibrated margin or relax the existing threshold.
  if (clasificacion.status === 'MATCH' && classifyDistance(secondDistance).status === 'MATCH') {
    return audit(uncertain, branchId, admin, candidate)
  }

  if (clasificacion.status === 'DENIED') {
    return audit({ ok: true, status: 'DENIED' }, branchId, admin, candidate)
  }

  if (clasificacion.status === 'REQUIRE_PIN') {
    return audit(uncertain, branchId, admin, candidate)
  }

  return audit(
    {
      ok: true,
      status: 'MATCH',
      employeeId: bestEmployeeId,
      fullName: nameByEmployee.get(bestEmployeeId) ?? '',
      confianza: clasificacion.confianza ?? 'tolerancia',
      ticket: await (meta.kiosk_context
        ? signFaceTicket(bestEmployeeId, ticketSecret, Date.now(), undefined, meta.kiosk_context)
        : signFaceTicket(bestEmployeeId, ticketSecret)),
    },
    branchId,
    admin,
    candidate
  )
}
