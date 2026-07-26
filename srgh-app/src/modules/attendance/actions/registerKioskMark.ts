'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { kioskMarkSchema, type KioskMarkInput } from '@/modules/attendance/types'
import { isValidPin } from '@/modules/attendance/lib/pin'
import { haversineDistanceMeters } from '@/modules/attendance/lib/geofence'
import { nowInCostaRica } from '@/modules/attendance/lib/time'

export type RegisterKioskMarkResult = { ok: true } | { ok: false; error: string }

interface HistorialRow {
  lab_id: number
  lab_sucursal_id: number
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
 * employeeId elegido en el selector — hoy mock de la camara, mañana
 * reconocimiento facial sin cambiar este contrato.
 *
 * Toda marca del kiosco se guarda como MANUAL, con o sin PIN: sin camara
 * real, marcarla como FACIAL seria una afirmacion falsa sobre como se
 * verifico la identidad. Cuando exista biometria real, ese es el unico punto
 * a cambiar aca.
 */
export async function registerKioskMark(input: KioskMarkInput): Promise<RegisterKioskMarkResult> {
  const parsed = kioskMarkSchema.safeParse(input)

  if (!parsed.success) {
    return { ok: false, error: 'Datos de marca invalidos.' }
  }

  const claims = await requirePermission(PERMISOS.ASISTENCIA_WRITE)
  const meta = claims.app_metadata as { usr_id?: number; empresa_id?: number }

  if (!meta.empresa_id) {
    return { ok: false, error: 'No se pudo determinar la empresa del kiosco.' }
  }

  const { employeeId, tipo, latitud, longitud, pin, dispositivoId } = parsed.data

  const supabase = await createClient()

  const { data: historial, error: errHistorial } = await supabase
    .from('sgrh_historial_laboral')
    .select('lab_id, lab_sucursal_id')
    .eq('lab_empleado_id', employeeId)
    .eq('lab_empresa_id', meta.empresa_id)
    .is('lab_fecha_fin', null)
    .maybeSingle<HistorialRow>()

  if (errHistorial || !historial) {
    return { ok: false, error: 'El empleado no tiene un contrato activo.' }
  }

  if (pin) {
    const { data: empleado } = await supabase
      .from('sgrh_empleados')
      .select('emp_fecha_nacimiento')
      .eq('emp_id', employeeId)
      .maybeSingle<EmployeeBirthRow>()

    if (!isValidPin(pin, empleado?.emp_fecha_nacimiento ?? null)) {
      return { ok: false, error: 'PIN incorrecto.' }
    }
  }

  // La distancia a la sucursal es informativa (no bloquea el marcado):
  // nadie definio una regla de rechazo por geocerca todavia.
  let distancia: number | null = null
  if (latitud !== null && longitud !== null) {
    const { data: sucursal } = await supabase
      .from('sgrh_sucursales')
      .select('suc_latitud, suc_longitud')
      .eq('suc_id', historial.lab_sucursal_id)
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

  const { error } = await supabase.from('sgrh_marcas_asistencia').insert({
    mar_historial_laboral_id: historial.lab_id,
    mar_sucursal_id: historial.lab_sucursal_id,
    mar_tipo: tipo,
    mar_fecha_hora: nowInCostaRica(),
    mar_latitud_marcada: latitud,
    mar_longitud_marcada: longitud,
    mar_distancia_geocerca_metros: distancia,
    mar_metodo_verificacion: 'MANUAL',
    mar_dispositivo_id: dispositivoId,
    mar_registrado_por_id: meta.usr_id ?? null,
    mar_observacion: pin ? 'Marcado con PIN de respaldo (camara no disponible).' : null,
  })

  if (error) {
    return { ok: false, error: 'No se pudo registrar la marca.' }
  }

  revalidatePath('/attendance')

  return { ok: true }
}
