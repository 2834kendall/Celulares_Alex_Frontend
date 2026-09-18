'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getUsuarioSucursalScope } from '@/lib/empresa/get-usuario-sucursales'
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
  let liveness: unknown
  try {
    const payload = await decryptFacePayload(parsed.data.vector, vectorKey)
    probe = payload.vector
    liveness = payload.liveness
  } catch {
    return { ok: false, error: 'No se pudo procesar la verificacion facial.' }
  }

  if (probe.length !== FACE_EMBEDDING_DIM) {
    return { ok: false, error: 'No se pudo procesar la verificacion facial.' }
  }

  // Sin prueba de vida NO se emite ticket. Reconocer de quien es una cara y
  // verificar si esa cara esta viva son preguntas distintas: sin esta guarda,
  // una foto del colaborador da distancia baja —correctamente, es la misma
  // cara— y el kiosco firmaria una marca FACIAL. Ver livenessProof.ts para el
  // alcance real de esta garantia.
  if (!isLivenessProof(liveness)) {
    return { ok: true, status: 'REQUIRE_PIN' }
  }

  const supabase = await createClient()

  const sucursalIds = meta.usr_id ? await getUsuarioSucursalScope(supabase, meta.usr_id) : null

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
  const assignments = await getDayAssignments(supabase, todayInCostaRica(), sucursalIds)

  if (!assignments.ok) {
    return { ok: false, error: assignments.error }
  }

  const historyIds = assignments.data.filter(isWorkable).map((a) => a.employmentHistoryId)

  // Nadie programado hoy aca: no hay contra quien comparar. Mismo trato que
  // 'nadie enrolado' — se cae al PIN, que igual va a rebotar en
  // registerKioskMark si de verdad no le toca trabajar.
  if (historyIds.length === 0) {
    return { ok: true, status: 'REQUIRE_PIN' }
  }

  const { data: historial, error: errHistorial } = await supabase
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
    .eq('lab_empresa_id', meta.empresa_id)
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
      // El log de auditoria tiene una sola columna de sucursal; un kiosco es
      // un dispositivo fisico de una sola sucursal, asi que "varias
      // asignadas" no deberia darse en la practica — se registra la primera.
      bia_sucursal_id: sucursalIds[0],
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
