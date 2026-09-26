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
  lecturaUtilizable,
  type DiaProgramado,
  type HorarioDia,
  type JustificacionDia,
  type TotalesPeriodo,
} from '@/modules/payroll/lib/horasPeriodo'
import type { HorasGuardadas } from '@/modules/payroll/lib/horasOrigen'

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

interface TipoAusenciaRow {
  tau_codigo: string
  tau_requiere_documento_ccss: boolean
  tau_porcentaje_pago_empleador: number | null
  tau_paga_empleador_dias: number | null
  tau_es_intradia: boolean
}

interface AusenciaRow {
  aus_historial_laboral_id: number
  aus_fecha_inicio: string
  aus_fecha_fin: string
  sgrh_cat_tipos_ausencia: TipoAusenciaRow | null
}

interface FeriadoRow {
  fer_fecha: string
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

/** Días calendario entre dos fechas 'YYYY-MM-DD' (fin − inicio). */
function diasEntre(inicio: string, fin: string): number {
  return Math.round(
    (Date.parse(`${fin}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / 86_400_000
  )
}

/**
 * Cuánto de un día de ausencia se paga como SALARIO, según el catálogo.
 *
 *  - Incapacidades y licencias certificadas por la CCSS o el INS
 *    (tau_requiere_documento_ccss): 0. Durante ellas el salario se suspende y
 *    lo que corresponde se paga como subsidio, por registrarIncapacidad y
 *    sincronizarAusenciaEnNomina. Acreditarlas también en el base las pagaba
 *    dos veces.
 *  - El resto (vacaciones, permisos): tau_porcentaje_pago_empleador, durante
 *    los primeros tau_paga_empleador_dias días de la ausencia contados desde
 *    su inicio; 0 días = toda la ausencia. Después de ese tope, 0.
 *
 * Sin tipo (fila huérfana o sin permiso para leer el catálogo) se paga
 * completo: es lo que el cálculo hacía antes de leer el tipo, y rebajarle a
 * alguien una ausencia aprobada por un dato que no se pudo leer es peor.
 */
function fraccionPagadaDeAusencia(row: AusenciaRow, fecha: string): number {
  const tipo = row.sgrh_cat_tipos_ausencia
  if (!tipo) return 1
  if (tipo.tau_requiere_documento_ccss) return 0

  const porcentaje = Number(tipo.tau_porcentaje_pago_empleador ?? 0)
  if (!Number.isFinite(porcentaje) || porcentaje <= 0) return 0

  const tope = Number(tipo.tau_paga_empleador_dias ?? 0)
  if (tope > 0 && diasEntre(row.aus_fecha_inicio, fecha) >= tope) return 0

  return Math.min(porcentaje, 100) / 100
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
    { data: feriados, error: errFeriados },
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
      .select(
        `aus_historial_laboral_id, aus_fecha_inicio, aus_fecha_fin,
         sgrh_cat_tipos_ausencia (
           tau_codigo, tau_requiere_documento_ccss, tau_porcentaje_pago_empleador,
           tau_paga_empleador_dias, tau_es_intradia
         )`
      )
      .in('aus_historial_laboral_id', historialLaboralIds)
      .eq('aus_estado', 'aprobada')
      .lte('aus_fecha_inicio', fechaFin)
      .gte('aus_fecha_fin', fechaInicio)
      .returns<AusenciaRow[]>(),
    // Nadie llena prg_es_feriado al programar (el comentario de la columna dice
    // que sí, pero ningún código lo hace), así que el feriado se lee también
    // del catálogo. Solo los de pago obligatorio: esos se pagan aunque no se
    // trabajen (Art. 148-149 CT). La RLS ya deja solo los nacionales y los de
    // la empresa del usuario.
    supabase
      .from('sgrh_cat_feriados')
      .select('fer_fecha')
      .eq('fer_activo', true)
      .eq('fer_es_pago_obligatorio', true)
      .gte('fer_fecha', fechaInicio)
      .lte('fer_fecha', fechaFin)
      .returns<FeriadoRow[]>(),
  ])

  if (errProgramacion) return { ok: false, error: 'No se pudo cargar la programación del periodo.' }
  if (errMarcas) return { ok: false, error: 'No se pudieron cargar las marcas de asistencia.' }
  if (errAusencias) return { ok: false, error: 'No se pudieron cargar las ausencias aprobadas.' }
  if (errFeriados) return { ok: false, error: 'No se pudieron cargar los feriados del periodo.' }

  const fechasFeriado = new Set((feriados ?? []).map((f) => f.fer_fecha.slice(0, 10)))

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

  // La ausencia de cada día, con cuánto se paga. Si dos ausencias cayeran el
  // mismo día (la pantalla de ausencias lo impide; registrar una incapacidad
  // desde nómina y la base, no):
  //  - un subsidio (incapacidad CCSS/INS) le gana a todo: suspende el salario,
  //    y si ganaran unas vacaciones, ese día se pagaba en el base Y como
  //    incapacidad;
  //  - entre las demás, la que más paga: ante la duda, no se rebaja.
  const ausenciaPorDia = new Map<string, JustificacionDia>()
  for (const row of ausencias ?? []) {
    const desde = row.aus_fecha_inicio > fechaInicio ? row.aus_fecha_inicio : fechaInicio
    const hasta = row.aus_fecha_fin < fechaFin ? row.aus_fecha_fin : fechaFin
    for (const fecha of rangoDeFechas(desde, hasta)) {
      const k = clave(row.aus_historial_laboral_id, fecha)
      const nueva: JustificacionDia = {
        motivo: 'ausencia',
        codigo: row.sgrh_cat_tipos_ausencia?.tau_codigo ?? null,
        esIntradia: row.sgrh_cat_tipos_ausencia?.tau_es_intradia ?? false,
        fraccionPagada: fraccionPagadaDeAusencia(row, fecha),
        esSubsidio: row.sgrh_cat_tipos_ausencia?.tau_requiere_documento_ccss === true,
      }
      const previa = ausenciaPorDia.get(k)
      const gana =
        !previa ||
        (nueva.esSubsidio && !previa.esSubsidio) ||
        (nueva.esSubsidio === previa.esSubsidio && nueva.fraccionPagada > previa.fraccionPagada)
      if (gana) ausenciaPorDia.set(k, nueva)
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
    const horarioDe = (fecha: string) => {
      const prog = programacionPorDia.get(clave(labId, fecha))
      return prog ? horarioDelDia(prog) : null
    }

    const arrastradasPorDia = new Map<string, RawMark[]>(
      fechas.map((fecha) => [fecha, salidaArrastrada(labId, fecha, horarioDe(fecha))])
    )

    // Una salida de madrugada que ya cerró el turno del día anterior no puede
    // volver a contarse en su propio día: ahí queda como una salida suelta sin
    // entrada. Si ese día está programado, se reportaba 'sin_entrada' y el pago
    // de toda la quincena se trababa; si no lo está, 'sin_horario'. En los dos
    // casos era un falso positivo del turno nocturno, no un error de nadie.
    const yaConsumidas = new Set<number>([...arrastradasPorDia.values()].flat().map((m) => m.id))

    const dias: DiaProgramado[] = fechas.map((fecha) => {
      const k = clave(labId, fecha)
      const prog = programacionPorDia.get(k)

      const propias = (marcasPorDia.get(k) ?? []).filter((m) => !yaConsumidas.has(m.id))

      return {
        fecha,
        horario: prog ? horarioDelDia(prog) : null,
        marcas: [...propias, ...(arrastradasPorDia.get(fecha) ?? [])],
        esDiaLibre: prog?.prg_es_dia_libre ?? false,
        esFeriado: (prog?.prg_es_feriado ?? false) || fechasFeriado.has(fecha),
        tieneAusenciaAprobada: ausenciaPorDia.has(k),
        ausencia: ausenciaPorDia.get(k) ?? null,
        // Sin fila de programación no se sabe si el día era libre o si a
        // alguien se le quedó el horario sin cargar: son datos distintos y
        // horasPeriodo.ts los trata distinto (ver DiaProgramado.sinProgramar).
        // La cola de un turno nocturno (la madrugada que ya cerró el turno
        // del día anterior) tampoco tiene fila propia y no es un hueco: si el
        // día de ayer se explicó con una salida arrastrada hacia este día, no
        // es un dato que falte, es la continuación de un turno.
        sinProgramar: !prog && (arrastradasPorDia.get(sumarDias(fecha, -1)) ?? []).length === 0,
      }
    })

    resultado.set(labId, calcularHorasPeriodo(dias))
  }

  return { ok: true, data: resultado }
}

/** Resultado de leer la asistencia de un periodo, por contrato. */
export type FotoAsistenciaPeriodo =
  | {
      estado: 'ok'
      datos: Map<number, HorasGuardadas>
      /**
       * La lectura completa de cada contrato con horas programadas (mismas
       * claves que `datos`). La usa quien tiene que calcular el ajuste.
       */
      totales: Map<number, TotalesPeriodo>
    }
  | { estado: 'sin_fechas' }
  | { estado: 'error' }

/**
 * Lo que dicen las marcas, en la forma que se guarda junto con la planilla
 * (ver lib/horasOrigen.ts). Es `getHorasDelPeriodo` reducida a los dos números
 * que se fotografían.
 *
 * No lanza, pero SÍ distingue los dos motivos por los que puede no haber
 * datos, y la diferencia importa: "el periodo no tiene fechas" es un hecho
 * (no hay marcas que leer, la foto se limpia) mientras que "la consulta se
 * cayó" no dice nada (hay que dejar la foto como estaba). Devolver un mapa
 * vacío en los dos casos hacía que un error transitorio borrara el registro de
 * quién había corregido las horas.
 */
export async function getFotoAsistencia(
  supabase: SupabaseServerClient,
  {
    historialLaboralIds,
    fechaInicio,
    fechaFin,
  }: { historialLaboralIds: number[]; fechaInicio: string | null; fechaFin: string | null }
): Promise<FotoAsistenciaPeriodo> {
  if (!fechaInicio || !fechaFin) return { estado: 'sin_fechas' }
  if (historialLaboralIds.length === 0) {
    return { estado: 'ok', datos: new Map(), totales: new Map() }
  }

  const horas = await getHorasDelPeriodo(supabase, {
    historialLaboralIds,
    fechaInicio,
    fechaFin,
  })
  if (!horas.ok) return { estado: 'error' }

  // Un contrato sin horas programadas NO entra al mapa. Su lectura son ceros,
  // y guardarlos como foto decía que la asistencia había dicho "0 h" — cuando
  // lo cierto es que no había con qué medir (o que el usuario no ve la
  // asistencia: RLS filtra las filas sin dar error). Esa foto de ceros dejaba
  // la fila marcada para siempre como "corregidas a mano" contra alguien que
  // no corrigió nada, y bloqueaba su pago. Quedar fuera del mapa es "sin
  // referencia", que es exactamente lo que pasa.
  const datos = new Map<number, HorasGuardadas>()
  const totalesUtiles = new Map<number, TotalesPeriodo>()
  for (const [labId, totales] of horas.data) {
    if (!lecturaUtilizable(totales)) continue
    datos.set(labId, { horas: totales.horasOrdinarias, horasExtra: totales.horasExtra })
    totalesUtiles.set(labId, totales)
  }

  return { estado: 'ok', datos, totales: totalesUtiles }
}
