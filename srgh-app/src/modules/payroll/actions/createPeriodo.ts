'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { crearPeriodoSchema, type CrearPeriodoInput } from '@/modules/payroll/types'
import { cargarEmpleadosDesdeAsistencia } from '@/modules/payroll/actions/cargarEmpleadosDesdeAsistencia'

export type CreatePeriodoResult =
  | {
      ok: true
      periodoId: number
      /** Empleados que quedaron cargados solos con sus horas de asistencia. */
      empleadosCargados: number
      /** De esos, cuántos no tenían horario y salieron con la jornada supuesta. */
      sinAsistencia: number
      /** Por qué no se pudieron cargar, si es que no se pudo. El periodo existe igual. */
      avisoCarga: string | null
    }
  | { ok: false; error: string }

/**
 * Crea un periodo de planilla en estado 'borrador' y lo llena con los
 * empleados activos de la sucursal, con sus horas de asistencia.
 *
 * El empresa_id sale del JWT (nunca del formulario) y RLS lo re-verifica en el
 * WITH CHECK del insert junto con el permiso NOMINA_WRITE.
 *
 * La carga va acá y no en un botón aparte porque un periodo vacío no le sirve
 * a nadie: antes había que saber que el paso siguiente era bajar la plantilla
 * de Excel y volver a subirla, y quien no lo sabía se quedaba mirando una
 * planilla en blanco con la asistencia ya registrada del otro lado.
 *
 * Si la carga falla, el periodo NO se deshace: crearlo salió bien y borrarlo
 * por un fallo posterior sería peor. Se devuelve el aviso para mostrarlo, y
 * los empleados se pueden cargar después con el botón de la pantalla.
 */
export async function createPeriodo(input: CrearPeriodoInput): Promise<CreatePeriodoResult> {
  const parsed = crearPeriodoSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Datos del periodo inválidos.' }
  }

  const claims = await requirePermission(PERMISOS.NOMINA_WRITE)
  const empresaId = (claims.app_metadata as { empresa_id?: number })?.empresa_id

  if (!empresaId) {
    return { ok: false, error: 'No se pudo determinar la empresa del usuario.' }
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('sgrh_nomina_periodo')
    .insert({
      ...parsed.data,
      npe_empresa_id: empresaId,
    })
    .select('npe_id')
    .single()

  if (error || !data) {
    if (error?.code === '23505') {
      return {
        ok: false,
        error: 'Ya existe un periodo para esa sucursal, mes y quincena.',
      }
    }
    if (error?.code === '42501') {
      return { ok: false, error: 'No tienes permiso para crear periodos de nómina.' }
    }
    return { ok: false, error: 'No se pudo crear el periodo de nómina.' }
  }

  const carga = await cargarEmpleadosDesdeAsistencia(data.npe_id)

  revalidatePath('/payroll')
  revalidatePath(`/payroll/${data.npe_id}`)

  return {
    ok: true,
    periodoId: data.npe_id,
    empleadosCargados: carga.ok ? carga.agregados : 0,
    sinAsistencia: carga.ok ? carga.sinAsistencia : 0,
    avisoCarga: carga.ok ? null : carga.error,
  }
}
