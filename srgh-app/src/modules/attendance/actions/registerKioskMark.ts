'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getUsuarioSucursalScope } from '@/lib/empresa/get-usuario-sucursales'
import { kioskMarkSchema, type KioskMarkInput } from '@/modules/attendance/types'
import { isValidPin } from '@/modules/attendance/lib/pin'
import { haversineDistanceMeters } from '@/modules/attendance/lib/geofence'
import { dateOfDay, nowInCostaRica } from '@/modules/attendance/lib/time'
import { findWorkableDay } from '@/modules/attendance/lib/workingDay'
import { verifyFaceTicket } from '@/modules/attendance/lib/face/faceTicket'

/**
 * `definitivo` distingue el rechazo que no va a cambiar por reintentar (no
 * esta programado, PIN incorrecto, contrato cerrado) del fallo pasajero que
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

interface EmployeeBirthRow {
  emp_fecha_nacimiento: string | null
}

interface SucursalCoordsRow {
  suc_latitud: number | null
  suc_longitud: number | null
}

/**
 * Registra la marca de un empleado desde el kiosco. La sesion es la de la
 * cuenta KIOSCO (sin login por empleado): el frontend solo manda el
 * employeeId identificado por la camara o elegido en el selector.
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
 * Metodo de verificacion: FACIAL solo si viene un ticket HMAC valido emitido
 * por verifyFace para ESTE empleado (la palabra del cliente no basta — un
 * fetch a mano podria decir "fue facial"). Cualquier otro caso, incluido un
 * ticket expirado de una marca que paso por la cola offline, se degrada a
 * MANUAL sin rechazar la marca: el metodo describe la verificacion, no
 * condiciona el registro.
 */
export async function registerKioskMark(input: KioskMarkInput): Promise<RegisterKioskMarkResult> {
  const parsed = kioskMarkSchema.safeParse(input)

  if (!parsed.success) {
    return { ok: false, error: 'Datos de marca invalidos.', definitivo: true }
  }

  const claims = await requirePermission(PERMISOS.ASISTENCIA_WRITE)
  const meta = claims.app_metadata as {
    usr_id?: number
    empresa_id?: number
    sucursal_ids?: number[] | null
  }

  if (!meta.empresa_id) {
    return { ok: false, error: 'No se pudo determinar la empresa del kiosco.' }
  }

  const { employeeId, tipo, latitud, longitud, pin, dispositivoId, ticketFacial, fechaHora } =
    parsed.data

  // Una marca que trae su propia hora viene de la cola offline: el rostro no
  // se pudo verificar contra el servidor en el momento del evento, asi que
  // sube como MANUAL aunque cargue un ticket. Hasta ahora eso pasaba por
  // omision (la cola nunca mandaba ticket); dejarlo explicito evita que un
  // cambio futuro en el kiosco convierta una marca diferida en "FACIAL".
  let metodoVerificacion: 'FACIAL' | 'MANUAL' = 'MANUAL'
  const ticketSecret = process.env.FACE_TICKET_SECRET
  if (!fechaHora && ticketFacial && ticketSecret) {
    if (await verifyFaceTicket(ticketFacial, employeeId, ticketSecret)) {
      metodoVerificacion = 'FACIAL'
    }
  }

  const supabase = await createClient()

  // Misma resolucion de sucursal que getActiveEmployees/verifyFace: el claim
  // del JWT si el hook ya lo emite, y si no, por consulta. Sin sucursal no se
  // marca — en un dispositivo fisicamente expuesto nunca se cae a "toda la
  // empresa".
  let sucursalIds = meta.sucursal_ids ?? null

  if (!sucursalIds && meta.usr_id) {
    sucursalIds = await getUsuarioSucursalScope(supabase, meta.usr_id)
  }

  if (!sucursalIds || sucursalIds.length === 0) {
    return { ok: false, error: 'Este kiosco no tiene una sucursal asignada.' }
  }

  // El dia que se valida es el del EVENTO, no el de hoy: una marca que estuvo
  // encolada desde ayer se comprueba contra la programacion de ayer.
  // Validarla contra la de hoy la rechazaria por una razon que no existia en
  // el momento en que la persona marco.
  const fechaEvento = dateOfDay(fechaHora ?? nowInCostaRica())

  const assignment = await findWorkableDay(supabase, fechaEvento, employeeId, sucursalIds)

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
  const { data: historial, error: errHistorial } = await supabase
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

  if (pin) {
    const { data: empleado } = await supabase
      .from('sgrh_empleados')
      .select('emp_fecha_nacimiento')
      .eq('emp_id', employeeId)
      .maybeSingle<EmployeeBirthRow>()

    if (!isValidPin(pin, empleado?.emp_fecha_nacimiento ?? null)) {
      return { ok: false, error: 'PIN incorrecto.', definitivo: true }
    }
  }

  // La distancia a la sucursal es informativa (no bloquea el marcado): nadie
  // definio una regla de rechazo por geocerca todavia. Se mide contra la
  // sucursal DEL DIA, que es donde la persona esta parada.
  let distancia: number | null = null
  if (latitud !== null && longitud !== null) {
    const { data: sucursal } = await supabase
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
    pin ? 'Marcado con PIN de respaldo (camara no disponible).' : null,
    fechaHora
      ? 'Marca sincronizada desde la cola offline: la hora es la del evento, no la de sincronizacion.'
      : null,
  ].filter((o): o is string => o !== null)

  const { error } = await supabase.from('sgrh_marcas_asistencia').insert({
    mar_historial_laboral_id: historial.lab_id,
    mar_sucursal_id: assignment.branchId,
    mar_tipo: tipo,
    mar_fecha_hora: fechaHora ?? nowInCostaRica(),
    mar_latitud_marcada: latitud,
    mar_longitud_marcada: longitud,
    mar_distancia_geocerca_metros: distancia,
    mar_metodo_verificacion: metodoVerificacion,
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
