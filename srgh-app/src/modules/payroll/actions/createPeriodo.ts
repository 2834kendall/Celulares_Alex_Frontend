'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { crearPeriodoSchema, type CrearPeriodoInput } from '@/modules/payroll/types'
import { cargarEmpleadosDesdeAsistencia } from '@/modules/payroll/actions/cargarEmpleadosDesdeAsistencia'
import { esCuentaDeEmpresa, leerNominaPorEmpresa } from '@/modules/payroll/lib/alcancePlanilla'

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
      /** Las filas se cargaron, pero sin las incapacidades ya registradas. */
      avisoAusencias?: string | null
      /**
       * La quincena ya tenía periodo (modelo por empresa): no se creó nada ni
       * se cargó a nadie, `periodoId` es el que ya existía.
       */
      yaExistia?: boolean
      /**
       * Periodo de toda la empresa creado por una cuenta de sucursal: solo se
       * cargó la gente de sus sucursales; el resto lo agrega una cuenta de toda
       * la empresa.
       */
      soloSusSucursales?: boolean
    }
  | { ok: false; error: string }

/**
 * Crea un periodo de planilla en estado 'borrador' y lo llena con los
 * empleados activos de su alcance, con sus horas de asistencia.
 *
 * Dos modelos (ver lib/alcancePlanilla.ts). Con un periodo por sucursal, la
 * sucursal viene del formulario. Con un periodo por empresa
 * (org_nomina_por_empresa) no hay sucursal: se cargan los empleados de las
 * sucursales que ve la cuenta, y si la quincena ya tiene periodo no es un
 * error — otra cuenta lo creó antes — y se devuelve ese.
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

  const porEmpresa = await leerNominaPorEmpresa(supabase)
  if (porEmpresa === null) {
    return { ok: false, error: 'No se pudo leer la configuración de nómina de la empresa.' }
  }
  if (!porEmpresa && parsed.data.npe_sucursal_id === null) {
    return { ok: false, error: 'La sucursal es obligatoria.' }
  }

  const { data, error } = await supabase
    .from('sgrh_nomina_periodo')
    .insert({
      ...parsed.data,
      // Lo que mande el formulario no cuenta: el modelo lo decide la empresa.
      npe_sucursal_id: porEmpresa ? null : parsed.data.npe_sucursal_id,
      npe_empresa_id: empresaId,
    })
    .select('npe_id')
    .single()

  if (error || !data) {
    if (error?.code === '23505' && porEmpresa) {
      // La quincena es una sola para toda la empresa: si ya existe, ese es el
      // periodo. La RLS deja ver el encabezado a quien tenga permiso de nómina.
      const { data: existente } = await supabase
        .from('sgrh_nomina_periodo')
        .select('npe_id')
        .eq('npe_periodo_anio', parsed.data.npe_periodo_anio)
        .eq('npe_periodo_mes', parsed.data.npe_periodo_mes)
        .eq('npe_quincena', parsed.data.npe_quincena)
        .maybeSingle<{ npe_id: number }>()
      if (existente) {
        return {
          ok: true,
          periodoId: existente.npe_id,
          empleadosCargados: 0,
          sinAsistencia: 0,
          avisoCarga: null,
          yaExistia: true,
        }
      }
      return { ok: false, error: 'Ya existe un periodo para ese mes y quincena.' }
    }
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
    avisoAusencias: carga.ok ? (carga.avisoAusencias ?? null) : null,
    ...(porEmpresa && !esCuentaDeEmpresa(claims) ? { soloSusSucursales: true } : {}),
  }
}
