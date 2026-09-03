/**
 * Reúne, para una quincena y un grupo de contratos, todo lo que hace falta
 * para calcular las horas trabajadas: la programación del periodo, las marcas
 * del kiosco y las ausencias aprobadas. El cálculo en sí vive en
 * horasPeriodo.ts, que es puro y no sabe de Supabase.
 *
 * Solo servidor; recibe el cliente ya creado para poder testearlo, igual que
 * planillaData.ts.
 */

import 'server-only'
import type { createClient } from '@/lib/supabase/server'
import { marcaTipoSchema } from '@/modules/attendance/types'
import type { RawMark } from '@/modules/attendance/lib/marks'
import {
  calcularHorasPeriodo,
  type DiaProgramado,
  type HorarioDia,
  type TotalesPeriodo,
} from '@/modules/payroll/lib/horasPeriodo'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

interface HorarioCatalogo {
  hor_hora_entrada: string
  hor_hora_salida: string
  hor_hora_inicio_almuerzo: string | null
  hor_hora_fin_almuerzo: string | null
  hor_hora_inicio_break: string | null
  hor_hora_fin_break: string | null
}

interface ProgramacionRow {
  prg_historial_laboral_id: number
  prg_fecha: string
  prg_es_dia_libre: boolean
  prg_es_feriado: boolean
  prg_hora_entrada_custom: string | null
  prg_hora_salida_custom: string | null
  prg_hora_inicio_almuerzo_custom: string | null
  prg_hora_fin_almuerzo_custom: string | null
  prg_hora_inicio_break_custom: string | null
  prg_hora_fin_break_custom: string | null
  sgrh_cat_horarios: HorarioCatalogo | null
}

interface MarcaRow {
  mar_id: number
  mar_historial_laboral_id: number
  mar_tipo: string
  mar_fecha_hora: string
}

interface AusenciaRow {
  aus_historial_laboral_id: number
  aus_fecha_inicio: string
  aus_fecha_fin: string
}

export interface GetHorasParams {
  historialLaboralIds: number[]
  /** 'YYYY-MM-DD'. */
  fechaInicio: string
  fechaFin: string
}

export type GetHorasResult =
  { ok: true; data: Map<number, TotalesPeriodo> } | { ok: false; error: string }

/** Suma días a una fecha 'YYYY-MM-DD' sin pasar por zonas horarias. */
function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

function rangoDeFechas(inicio: string, fin: string): string[] {
  const fechas: string[] = []
  for (let f = inicio; f <= fin; f = sumarDias(f, 1)) fechas.push(f)
  return fechas
}

/**
 * Horario del día: el del catálogo, con los `_custom` de la programación
 * pisándolo campo por campo. Un día sin horario asignado y sin custom no tiene
 * jornada que cumplir.
 */
function horarioDelDia(row: ProgramacionRow): HorarioDia | null {
  const cat = row.sgrh_cat_horarios
  const entrada = row.prg_hora_entrada_custom ?? cat?.hor_hora_entrada ?? null
  const salida = row.prg_hora_salida_custom ?? cat?.hor_hora_salida ?? null

  if (!entrada || !salida) return null

  return {
    entrada,
    salida,
    inicioAlmuerzo: row.prg_hora_inicio_almuerzo_custom ?? cat?.hor_hora_inicio_almuerzo ?? null,
    finAlmuerzo: row.prg_hora_fin_almuerzo_custom ?? cat?.hor_hora_fin_almuerzo ?? null,
    inicioBreak: row.prg_hora_inicio_break_custom ?? cat?.hor_hora_inicio_break ?? null,
    finBreak: row.prg_hora_fin_break_custom ?? cat?.hor_hora_fin_break ?? null,
  }
}

/**
 * Horas trabajadas de cada contrato en el periodo.
 *
 * La ventana de marcas se abre un día más allá del fin del periodo a
 * propósito: un turno nocturno que arranca el último día sale de madrugada del
 * siguiente, y sin ese margen su marca de salida no aparecería y el día se
 * reportaría como "sin salida".
 */
export async function getHorasDelPeriodo(
  supabase: SupabaseServerClient,
  { historialLaboralIds, fechaInicio, fechaFin }: GetHorasParams
): Promise<GetHorasResult> {
  if (historialLaboralIds.length === 0) return { ok: true, data: new Map() }

  const [
    { data: programacion, error: errProgramacion },
    { data: marcas, error: errMarcas },
    { data: ausencias, error: errAusencias },
  ] = await Promise.all([
    supabase
      .from('sgrh_programacion_semanal')
      .select(
        `
        prg_historial_laboral_id,
        prg_fecha,
        prg_es_dia_libre,
        prg_es_feriado,
        prg_hora_entrada_custom,
        prg_hora_salida_custom,
        prg_hora_inicio_almuerzo_custom,
        prg_hora_fin_almuerzo_custom,
        prg_hora_inicio_break_custom,
        prg_hora_fin_break_custom,
        sgrh_cat_horarios (
          hor_hora_entrada, hor_hora_salida,
          hor_hora_inicio_almuerzo, hor_hora_fin_almuerzo,
          hor_hora_inicio_break, hor_hora_fin_break
        )
      `
      )
      .in('prg_historial_laboral_id', historialLaboralIds)
      .gte('prg_fecha', fechaInicio)
      .lte('prg_fecha', fechaFin)
      .returns<ProgramacionRow[]>(),
    supabase
      .from('sgrh_marcas_asistencia')
      .select('mar_id, mar_historial_laboral_id, mar_tipo, mar_fecha_hora')
      .in('mar_historial_laboral_id', historialLaboralIds)
      .gte('mar_fecha_hora', `${fechaInicio} 00:00:00`)
      .lte('mar_fecha_hora', `${sumarDias(fechaFin, 1)} 23:59:59`)
      .returns<MarcaRow[]>(),
    supabase
      .from('sgrh_ausencias')
      .select('aus_historial_laboral_id, aus_fecha_inicio, aus_fecha_fin')
      .in('aus_historial_laboral_id', historialLaboralIds)
      .eq('aus_estado', 'aprobada')
      .lte('aus_fecha_inicio', fechaFin)
      .gte('aus_fecha_fin', fechaInicio)
      .returns<AusenciaRow[]>(),
  ])

  if (errProgramacion) return { ok: false, error: 'No se pudo cargar la programación del periodo.' }
  if (errMarcas) return { ok: false, error: 'No se pudieron cargar las marcas de asistencia.' }
  if (errAusencias) return { ok: false, error: 'No se pudieron cargar las ausencias aprobadas.' }

  const clave = (labId: number, fecha: string) => `${labId}|${fecha}`

  const programacionPorDia = new Map<string, ProgramacionRow>()
  for (const row of programacion ?? []) {
    programacionPorDia.set(clave(row.prg_historial_laboral_id, row.prg_fecha), row)
  }

  const marcasPorDia = new Map<string, RawMark[]>()
  for (const row of marcas ?? []) {
    // mar_tipo es varchar sin enum en los tipos generados: una fila que no
    // calce se descarta en silencio, igual que en el panel de asistencia.
    const tipo = marcaTipoSchema.safeParse(row.mar_tipo)
    if (!tipo.success) continue

    const fecha = row.mar_fecha_hora.slice(0, 10)
    const k = clave(row.mar_historial_laboral_id, fecha)
    const lista = marcasPorDia.get(k) ?? []
    lista.push({ id: row.mar_id, tipo: tipo.data, fechaHora: row.mar_fecha_hora })
    marcasPorDia.set(k, lista)
  }

  const diasConAusencia = new Set<string>()
  for (const row of ausencias ?? []) {
    const desde = row.aus_fecha_inicio > fechaInicio ? row.aus_fecha_inicio : fechaInicio
    const hasta = row.aus_fecha_fin < fechaFin ? row.aus_fecha_fin : fechaFin
    for (const fecha of rangoDeFechas(desde, hasta)) {
      diasConAusencia.add(clave(row.aus_historial_laboral_id, fecha))
    }
  }

  /**
   * Salida que cayó en la madrugada del día siguiente, para turnos nocturnos.
   *
   * Solo se arrastra cuando el HORARIO cruza medianoche, y solo si esa salida
   * ocurre antes de la primera entrada del día siguiente. Sin esas dos
   * condiciones, un día diurno al que se le olvidó marcar la salida se comería
   * la salida del día siguiente y reportaría una jornada de 30 horas.
   */
  const salidaArrastrada = (
    labId: number,
    fecha: string,
    horario: HorarioDia | null
  ): RawMark[] => {
    if (!horario) return []
    const minutos = (h: string) => {
      const [hh, mm] = h.split(':').map(Number)
      return hh * 60 + mm
    }
    if (minutos(horario.salida) >= minutos(horario.entrada)) return []

    const siguientes = marcasPorDia.get(clave(labId, sumarDias(fecha, 1))) ?? []
    const primeraEntrada = siguientes
      .filter((m) => m.tipo === 'entrada')
      .sort((a, b) => a.fechaHora.localeCompare(b.fechaHora))[0]

    return siguientes.filter(
      (m) => m.tipo === 'salida' && (!primeraEntrada || m.fechaHora < primeraEntrada.fechaHora)
    )
  }

  const fechas = rangoDeFechas(fechaInicio, fechaFin)
  const resultado = new Map<number, TotalesPeriodo>()

  for (const labId of historialLaboralIds) {
    const dias: DiaProgramado[] = fechas.map((fecha) => {
      const k = clave(labId, fecha)
      const prog = programacionPorDia.get(k)

      const horario = prog ? horarioDelDia(prog) : null

      return {
        fecha,
        horario,
        marcas: [...(marcasPorDia.get(k) ?? []), ...salidaArrastrada(labId, fecha, horario)],
        esDiaLibre: prog?.prg_es_dia_libre ?? false,
        esFeriado: prog?.prg_es_feriado ?? false,
        tieneAusenciaAprobada: diasConAusencia.has(k),
      }
    })

    resultado.set(labId, calcularHorasPeriodo(dias))
  }

  return { ok: true, data: resultado }
}
