'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireKioskAccess } from '@/modules/attendance/lib/kioskAccess'
import { kioskMarkSchema, type KioskMarkInput } from '@/modules/attendance/types'
import { haversineDistanceMeters } from '@/modules/attendance/lib/geofence'
import {
  costaRicaWallTimeToEpochMs,
  dateOfDay,
  nowInCostaRica,
  timeOfDay,
} from '@/modules/attendance/lib/time'
import { findWorkableDay } from '@/modules/attendance/lib/workingDay'
import {
  absenceBlocksMarkMessage,
  findApprovedAbsence,
  loadDayJourney,
  resolveKioskSucursalIds,
} from '@/modules/attendance/lib/dayJourney'
import {
  allowedNextMarks,
  describeExitWindow,
  describeLunchWindow,
  describeSequenceRejection,
  isExitWindowOpen,
  isLunchWindowOpen,
} from '@/modules/attendance/lib/marks'
import { verifyFaceTicket } from '@/modules/attendance/lib/face/faceTicket'

/**
 * `definitivo` distingue el rechazo que no va a cambiar por reintentar (no
 * esta programado, rostro no verificado, contrato cerrado) del fallo pasajero que
 * si conviene reintentar (la base no respondio). Lo necesita la cola offline:
 * sin esta marca, una marca encolada que el servidor rechaza para siempre se
 * reintentaba cada 60 segundos indefinidamente, sin drenar nunca y sin que
 * nadie se enterara — ver useOfflineSync.
 */
export type RegisterKioskMarkResult =
  { ok: true } | { ok: false; error: string; definitivo?: boolean }

interface HistorialRow {
  lab_id: number
}

interface SucursalCoordsRow {
  suc_latitud: number | null
  suc_longitud: number | null
}

/**
 * Registra la marca de un empleado desde el kiosco. La sesion es la de la
 * cuenta KIOSCO (sin login por empleado): el frontend solo manda el
 * employeeId que reconocio Face ID, junto con el ticket que lo prueba.
 *
 * Marcar exige estar PROGRAMADO ese dia en la sucursal de este kiosco. No
 * alcanza con tener contrato activo: si no le toca trabajar aca hoy, no marca
 * (decision del cliente, 2026-09-17). La guarda vive del lado del servidor y
 * no solo en los botones del kiosco — esconder un boton no es una regla, y
 * esta accion es invocable directamente.
 *
 * De ahi sale ademas la sucursal de la marca: mar_sucursal_id guarda DONDE se
 * marco (prg_sucursal_id, la sucursal del dia), no la del contrato. Si no, la
 * geocerca mediria la distancia contra una tienda en la que la persona no
 * estuvo, y el resumen mensual la contaria en la sucursal equivocada.
 *
 * Solo Face ID (SGRH-88, decision del cliente): sin un ticket HMAC valido
 * emitido por verifyFace para ESTE empleado, no hay marca. El PIN de respaldo
 * se elimino — si el rostro no se reconoce, la marca la registra el
 * encargado desde el panel, con su justificacion. Por eso toda marca que
 * entra por aca queda como FACIAL.
 */
export async function registerKioskMark(input: KioskMarkInput): Promise<RegisterKioskMarkResult> {
  const parsed = kioskMarkSchema.safeParse(input)

  if (!parsed.success) {
    return { ok: false, error: 'Datos de marca invalidos.', definitivo: true }
  }

  const claims = await requireKioskAccess()
  const meta = claims.app_metadata as {
    usr_id?: number
    empresa_id?: number
    sucursal_ids?: number[] | null
  }

  if (!meta.empresa_id) {
    return { ok: false, error: 'No se pudo determinar la empresa del kiosco.' }
  }

  const { employeeId, tipo, latitud, longitud, dispositivoId, ticketFacial, fechaHora } =
    parsed.data

  const ticketSecret = process.env.FACE_TICKET_SECRET

  if (!ticketSecret) {
    return { ok: false, error: 'El reconocimiento facial no esta configurado en el servidor.' }
  }

  // El ticket vence a los pocos minutos de emitido. Una marca en linea se
  // valida contra el reloj del servidor; una que viene de la cola offline,
  // contra la hora del EVENTO: prueba que la cara se verifico justo antes de
  // marcar, aunque la marca llegue horas despues. Una hora futura no se
  // acepta (margen de un minuto por diferencias de reloj de la tablet).
  const ahoraMs = Date.now()
  const eventoMs = fechaHora ? costaRicaWallTimeToEpochMs(fechaHora) : ahoraMs

  const rostroVerificado =
    Number.isFinite(eventoMs) &&
    eventoMs <= ahoraMs + 60_000 &&
    (await verifyFaceTicket(ticketFacial, employeeId, ticketSecret, eventoMs))

  if (!rostroVerificado) {
    return {
      ok: false,
      error: 'No se pudo verificar tu rostro. Avisa al encargado para que registre tu marca.',
      definitivo: true,
    }
  }

  const supabase = await createClient()

  // El claim del JWT si el hook ya lo emite, y si no, por consulta. Sin
  // sucursal no se marca — en un dispositivo fisicamente expuesto nunca se cae
  // a "toda la empresa".
  const sucursalIds = await resolveKioskSucursalIds(supabase, meta)

  if (!sucursalIds || sucursalIds.length === 0) {
    return { ok: false, error: 'Este kiosco no tiene una sucursal asignada.' }
  }

  // El dia que se valida es el del EVENTO, no el de hoy: una marca que estuvo
  // encolada desde ayer se comprueba contra la programacion de ayer.
  // Validarla contra la de hoy la rechazaria por una razon que no existia en
  // el momento en que la persona marco.
  const fechaEvento = dateOfDay(fechaHora ?? nowInCostaRica())

  // Desde aca todo va con el cliente admin: la cuenta KIOSCO no puede leer
  // programacion, contratos, ausencias ni marcas, ni insertar marcas (ver
  // lib/kioskAccess.ts). Cada consulta queda acotada a las sucursales de la
  // cuenta, validadas arriba, o a la empresa del JWT.
  const admin = createAdminClient()

  const assignment = await findWorkableDay(admin, fechaEvento, employeeId, sucursalIds)

  if (!assignment) {
    return {
      ok: false,
      error: 'No tienes turno asignado en esta sucursal para esta fecha.',
      definitivo: true,
    }
  }

  // Por lab_id (llave primaria) y no por lab_empleado_id: buscar por empleado
  // con maybeSingle reventaba si alguien llegaba a tener dos contratos
  // activos, y devolvia "no tiene contrato activo" — el mensaje mas engañoso
  // posible. La programacion ya apunta al contrato concreto.
  const { data: historial, error: errHistorial } = await admin
    .from('sgrh_historial_laboral')
    .select('lab_id')
    .eq('lab_id', assignment.employmentHistoryId)
    .eq('lab_empresa_id', meta.empresa_id)
    .is('lab_fecha_fin', null)
    .maybeSingle<HistorialRow>()

  if (errHistorial) {
    return { ok: false, error: 'No se pudo validar el contrato del colaborador.' }
  }

  if (!historial) {
    return { ok: false, error: 'El empleado no tiene un contrato activo.', definitivo: true }
  }

  // Un dia cubierto por una ausencia aprobada (incapacidad, vacaciones,
  // permiso) no se marca: ya esta resuelto por la ausencia, y si la persona
  // volvio antes, el encargado ajusta la ausencia y registra la marca.
  const ausencia = await findApprovedAbsence(admin, historial.lab_id, fechaEvento)

  if (!ausencia.ok) {
    return { ok: false, error: ausencia.error }
  }

  if (ausencia.tipo) {
    return { ok: false, error: absenceBlocksMarkMessage(ausencia.tipo), definitivo: true }
  }

  // Secuencia de la jornada (SGRH-88): solo se acepta la marca que
  // corresponde segun lo ya marcado ese dia — no se puede salir sin haber
  // entrado, ni empezar el almuerzo con el receso abierto. El kiosco ya
  // esconde los botones que no van, pero esta accion es invocable
  // directamente, y la cola offline manda marcas que el kiosco no pudo
  // validar al hacerlas.
  //
  // Se mira el dia del EVENTO: una marca encolada ayer se valida contra lo
  // que se marco ayer.
  const jornada = await loadDayJourney(admin, historial.lab_id, fechaEvento)

  if (!jornada.ok) {
    return { ok: false, error: 'No se pudo validar la secuencia de marcas.' }
  }

  // El almuerzo se toma a la hora del horario (SGRH-88, decision del
  // cliente): tomarlo cuando a cada quien le parezca desordena la planilla,
  // que liquida sobre la jornada programada. Se mide contra la hora del
  // EVENTO, para que una marca que estuvo en la cola offline se juzgue por
  // cuando se hizo y no por cuando se sincronizo.
  const horaEvento = timeOfDay(fechaHora ?? nowInCostaRica())
  const almuerzoAbierto = isLunchWindowOpen(horaEvento, assignment.expectedLunchStart)
  const salidaAbierta = isExitWindowOpen(horaEvento, assignment.expectedEnd)

  if (tipo === 'inicio_almuerzo' && !almuerzoAbierto) {
    return {
      ok: false,
      error: describeLunchWindow(assignment.expectedLunchStart!, assignment.expectedLunchEnd!),
      definitivo: true,
    }
  }

  // Una salida antes de tiempo casi siempre es un toque por error, y cierra
  // el dia: despues de marcarla no queda nada por marcar.
  if (tipo === 'salida' && !salidaAbierta) {
    return {
      ok: false,
      error: describeExitWindow(assignment.expectedEnd!),
      definitivo: true,
    }
  }

  const permitidas = allowedNextMarks(jornada.journey, {
    lunchWindowOpen: almuerzoAbierto,
    exitWindowOpen: salidaAbierta,
  })

  if (!permitidas.includes(tipo)) {
    return { ok: false, error: describeSequenceRejection(tipo, permitidas), definitivo: true }
  }

  // La distancia a la sucursal es informativa (no bloquea el marcado): nadie
  // definio una regla de rechazo por geocerca todavia. Se mide contra la
  // sucursal DEL DIA, que es donde la persona esta parada.
  let distancia: number | null = null
  if (latitud !== null && longitud !== null) {
    const { data: sucursal } = await admin
      .from('sgrh_sucursales')
      .select('suc_latitud, suc_longitud')
      .eq('suc_id', assignment.branchId)
      .maybeSingle<SucursalCoordsRow>()

    if (sucursal?.suc_latitud != null && sucursal?.suc_longitud != null) {
      distancia = haversineDistanceMeters(
        latitud,
        longitud,
        sucursal.suc_latitud,
        sucursal.suc_longitud
      )
    }
  }

  // La hora del evento manda sobre la del servidor. Una marca sincronizada
  // horas despues de hacerse (tablet sin red) tiene que quedar guardada a la
  // hora en que el empleado marco, no a la que se restablecio el internet:
  // de lo contrario el resumen mensual la lee como una tardanza inventada.
  const observaciones = [
    fechaHora
      ? 'Marca sincronizada desde la cola offline: la hora es la del evento, no la de sincronizacion.'
      : null,
  ].filter((o): o is string => o !== null)

  const { error } = await admin.from('sgrh_marcas_asistencia').insert({
    mar_historial_laboral_id: historial.lab_id,
    mar_sucursal_id: assignment.branchId,
    mar_tipo: tipo,
    mar_fecha_hora: fechaHora ?? nowInCostaRica(),
    mar_latitud_marcada: latitud,
    mar_longitud_marcada: longitud,
    mar_distancia_geocerca_metros: distancia,
    mar_metodo_verificacion: 'FACIAL',
    mar_dispositivo_id: dispositivoId,
    mar_registrado_por_id: meta.usr_id ?? null,
    mar_observacion: observaciones.length > 0 ? observaciones.join(' ') : null,
  })

  if (error) {
    return { ok: false, error: 'No se pudo registrar la marca.' }
  }

  revalidatePath('/attendance')

  return { ok: true }
}
