'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getWeekDates } from '@/modules/schedules/lib/week'

interface EmpleadoJoin {
  emp_id: number
  emp_nombre: string
  emp_apellido_1: string
  emp_apellido_2: string | null
}

interface PuestoJoin {
  pue_nombre: string | null
}

interface HistorialLaboralRow {
  lab_id: number
  lab_empleado_id: number
  lab_sucursal_id: number
  sgrh_empleados: EmpleadoJoin | null
  sgrh_cat_puestos: PuestoJoin | null
}

interface HorarioJoin {
  hor_id: number
  hor_nombre: string
  hor_hora_entrada: string
  hor_hora_salida: string
  hor_hora_inicio_almuerzo: string
  hor_hora_fin_almuerzo: string
}

interface ProgramacionRow {
  prg_id: number
  prg_historial_laboral_id: number
  prg_fecha: string
  prg_es_dia_libre: boolean
  prg_horario_id: number | null
  sgrh_cat_horarios: HorarioJoin | null
  prg_hora_entrada_custom: string | null
  prg_hora_salida_custom: string | null
}

export interface DayAssignment {
  fecha: string
  prgId: number | null
  horarioId: number | null
  horarioNombre: string | null
  horaEntrada: string | null
  horaSalida: string | null
  esDiaLibre: boolean
  horas: number
  horaEntradaCustom?: string | null
  horaSalidaCustom?: string | null
}

export interface EmployeeWeekRow {
  historialLaboralId: number
  empleadoId: number
  sucursalId: number
  nombreCompleto: string
  puesto: string | null
  dias: DayAssignment[]
  totalSemanal: number
}

export type GetWeeklyScheduleResult =
  { ok: true; weekDates: string[]; data: EmployeeWeekRow[] } | { ok: false; error: string }

function horasEntrePuntos(entrada: string, salida: string, almInicio: string, almFin: string) {
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  }
  const bruto = toMin(salida) - toMin(entrada)
  const almuerzo = toMin(almFin) - toMin(almInicio)
  return Math.max(0, (bruto - almuerzo) / 60)
}

export async function getWeeklySchedule(weekStartISO: string): Promise<GetWeeklyScheduleResult> {
  const claims = await requirePermission(PERMISOS.HORARIOS_READ)
  const empresaId = (claims.app_metadata as { empresa_id?: number })?.empresa_id

  if (!empresaId) {
    return { ok: false, error: 'No se pudo determinar la empresa del usuario.' }
  }

  const weekDates = getWeekDates(weekStartISO)
  const supabase = await createClient()

  const { data: historial, error: errHistorial } = await supabase
    .from('sgrh_historial_laboral')
    .select(
      `
      lab_id,
      lab_empleado_id,
      lab_sucursal_id,
      sgrh_empleados ( emp_id, emp_nombre, emp_apellido_1, emp_apellido_2 ),
      sgrh_cat_puestos ( pue_nombre )
    `
    )
    .eq('lab_empresa_id', empresaId)
    .is('lab_fecha_fin', null)
    .returns<HistorialLaboralRow[]>()

  if (errHistorial) {
    return { ok: false, error: 'No se pudieron cargar los colaboradores.' }
  }

  const labIds = historial.map((h) => h.lab_id)

  const { data: programacion, error: errProg } = labIds.length
    ? await supabase
        .from('sgrh_programacion_semanal')
        .select(
          `
          prg_id,
          prg_historial_laboral_id,
          prg_fecha,
          prg_es_dia_libre,
          prg_horario_id,
          sgrh_cat_horarios ( hor_id, hor_nombre, hor_hora_entrada, hor_hora_salida, hor_hora_inicio_almuerzo, hor_hora_fin_almuerzo ),
            prg_hora_entrada_custom,
            prg_hora_salida_custom
            
        `
        )
        .in('prg_historial_laboral_id', labIds)
        .gte('prg_fecha', weekDates[0])
        .lte('prg_fecha', weekDates[6])
        .returns<ProgramacionRow[]>()
    : { data: [] as ProgramacionRow[], error: null }

  if (errProg) {
    return { ok: false, error: 'No se pudo cargar la programacion semanal.' }
  }

  const data: EmployeeWeekRow[] = historial.map((h) => {
    const emp = h.sgrh_empleados
    const puesto = h.sgrh_cat_puestos
    const nombreCompleto = emp
      ? `${emp.emp_nombre} ${emp.emp_apellido_1}${emp.emp_apellido_2 ? ' ' + emp.emp_apellido_2 : ''}`
      : 'Sin nombre'

    let totalSemanal = 0

    const dias: DayAssignment[] = weekDates.map((fecha) => {
      const asignacion = programacion?.find(
        (p) => p.prg_historial_laboral_id === h.lab_id && p.prg_fecha === fecha
      )

      if (!asignacion) {
        return {
          fecha,
          prgId: null,
          horarioId: null,
          horarioNombre: null,
          horaEntrada: null,
          horaSalida: null,
          esDiaLibre: false,
          horas: 0,
        }
      }

      const horario = asignacion.sgrh_cat_horarios
      const esPersonalizado = Boolean(
        asignacion.prg_hora_entrada_custom && asignacion.prg_hora_salida_custom
      )
      let horas = 0

      if (!asignacion.prg_es_dia_libre) {
        if (esPersonalizado) {
          const toMin = (t: string) => {
            const [h, m] = t.split(':').map(Number)
            return h * 60 + m
          }

          horas = Math.max(
            0,
            (toMin(asignacion.prg_hora_salida_custom!) -
              toMin(asignacion.prg_hora_entrada_custom!)) /
              60
          )
          totalSemanal += horas
        } else if (horario) {
          horas = horasEntrePuntos(
            horario.hor_hora_entrada,
            horario.hor_hora_salida,
            horario.hor_hora_inicio_almuerzo,
            horario.hor_hora_fin_almuerzo
          )
          totalSemanal += horas
        }
      }

      return {
        fecha,
        prgId: asignacion.prg_id,
        horarioId: asignacion.prg_horario_id,
        horarioNombre: horario?.hor_nombre ?? null,
        horaEntrada: esPersonalizado
          ? asignacion.prg_hora_entrada_custom
          : (horario?.hor_hora_entrada ?? null),
        horaSalida: esPersonalizado
          ? asignacion.prg_hora_salida_custom
          : (horario?.hor_hora_salida ?? null),
        horaEntradaCustom: asignacion.prg_hora_entrada_custom,
        horaSalidaCustom: asignacion.prg_hora_salida_custom,
        esDiaLibre: asignacion.prg_es_dia_libre,
        horas,
      }
    })

    return {
      historialLaboralId: h.lab_id,
      empleadoId: h.lab_empleado_id,
      sucursalId: h.lab_sucursal_id,
      nombreCompleto,
      puesto: puesto?.pue_nombre ?? null,
      dias,
      totalSemanal,
    }
  })

  return { ok: true, weekDates, data }
}
