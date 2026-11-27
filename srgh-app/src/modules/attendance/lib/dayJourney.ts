import type { createClient } from '@/lib/supabase/server'
import type { createAdminClient } from '@/lib/supabase/admin'
import { getUsuarioSucursalScope } from '@/lib/empresa/get-usuario-sucursales'
import { groupIntoDayJourney, type DayJourney, type RawMark } from '@/modules/attendance/lib/marks'
import { marcaTipoSchema } from '@/modules/attendance/types'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>
type SupabaseAdminClient = ReturnType<typeof createAdminClient>

interface MarkDbRow {
  mar_id: number
  mar_tipo: string
  mar_fecha_hora: string
}

export type LoadDayJourneyResult =
  | {
      ok: true
      journey: DayJourney
      snapshot: [number, string, string][]
      /** Salidas ya marcadas ese dia: cuantos bloques quedaron cerrados. */
      salidas: number
      /**
       * Ya marco un inicio de receso ese dia, en cualquier bloque y sucursal.
       * El receso es uno por dia (SGRH-120), no uno por bloque.
       */
      recesoTomado: boolean
    }
  | { ok: false; error: string }

/**
 * La jornada de UN contrato en UN dia, a partir de sus marcas.
 *
 * El kiosco la lee con el cliente ADMIN, despues de validar permisos y turno:
 * la cuenta KIOSCO no puede leer marcas, y no debe poder. Las politicas de
 * UPDATE y DELETE de marcas solo piden ASISTENCIA_WRITE (que el kiosco tiene
 * para registrar), y en Postgres lo unico que le impedia modificar o borrar
 * marcas era no poder verlas.
 */
export async function loadDayJourney(
  supabase: SupabaseServerClient | SupabaseAdminClient,
  employmentHistoryId: number,
  dateISO: string,
  /**
   * Bloques de trabajo del dia (ver bloquesDelDia). Con dos o mas, cada
   * bloque tiene su entrada y su salida (SGRH-110): despues de cerrar uno que
   * no es el ultimo, la jornada que se valida es la del bloque siguiente, que
   * empieza vacia. Sin esto, la salida del primer bloque cerraba el dia y la
   * persona no podia marcar la entrada del segundo.
   */
  bloques: number = 1
): Promise<LoadDayJourneyResult> {
  const { data, error } = await supabase
    .from('sgrh_marcas_asistencia')
    .select('mar_id, mar_tipo, mar_fecha_hora')
    .eq('mar_historial_laboral_id', employmentHistoryId)
    .gte('mar_fecha_hora', `${dateISO} 00:00:00`)
    .lte('mar_fecha_hora', `${dateISO} 23:59:59.999999`)
    .returns<MarkDbRow[]>()

  if (error) {
    return { ok: false, error: 'No se pudieron cargar las marcas del día.' }
  }

  const marks: RawMark[] = []
  for (const m of data ?? []) {
    const tipo = marcaTipoSchema.safeParse(m.mar_tipo)
    if (tipo.success) marks.push({ id: m.mar_id, tipo: tipo.data, fechaHora: m.mar_fecha_hora })
  }

  const ordenadas = [...marks].sort((a, b) => a.fechaHora.localeCompare(b.fechaHora))
  const salidas = ordenadas.filter((m) => m.tipo === 'salida')
  const ultimaSalida = salidas[salidas.length - 1]
  const delBloqueActual =
    bloques > 1 && ultimaSalida && salidas.length < bloques
      ? ordenadas.filter((m) => m.fechaHora > ultimaSalida.fechaHora)
      : marks

  return {
    ok: true,
    journey: groupIntoDayJourney(delBloqueActual),
    salidas: salidas.length,
    recesoTomado: marks.some((m) => m.tipo === 'inicio_receso'),
    snapshot: [...(data ?? [])]
      .sort((a, b) => a.mar_id - b.mar_id)
      .map((m) => [m.mar_id, m.mar_tipo, m.mar_fecha_hora.replace('T', ' ').slice(0, 19)]),
  }
}

/**
 * Sucursales del kiosco: el claim del JWT si el hook ya lo emite, y si no,
 * por consulta. null o vacio = kiosco sin sucursal, que el llamador trata como
 * error — en un dispositivo fisicamente expuesto nunca se cae a "toda la
 * empresa".
 */
export async function resolveKioskSucursalIds(
  supabase: SupabaseServerClient,
  meta: { usr_id?: number; sucursal_ids?: number[] | null }
): Promise<number[] | null> {
  if (meta.sucursal_ids && meta.sucursal_ids.length > 0) return meta.sucursal_ids
  if (!meta.usr_id) return null
  return getUsuarioSucursalScope(supabase, meta.usr_id)
}

interface BloqueProgramacionRow {
  prg_sucursal_id: number
  prg_es_dia_libre: boolean
  prg_hora_entrada_custom: string | null
  prg_hora_salida_custom: string | null
  prg_hora_inicio_break_custom: string | null
  sgrh_cat_horarios: {
    hor_hora_entrada: string
    hor_hora_salida: string
    hor_hora_entrada_2: string | null
    hor_hora_salida_2: string | null
    hor_hora_inicio_break: string | null
  } | null
}

export interface ScheduledBlock {
  inicio: string
  fin: string
  branchId: number
}

export type BloquesDelDiaResult =
  | {
      ok: true
      bloques: ScheduledBlock[]
      /**
       * Algun tramo del dia trae receso (SGRH-120). Se toma una vez al dia,
       * en la sucursal que la persona quiera de las que tiene turno: no
       * importa si el tramo de ESTE kiosco es el que lo trae.
       */
      tieneReceso: boolean
    }
  | { ok: false; error: string }

/**
 * Bloques de trabajo de UN contrato en UN dia, en TODAS sus sucursales y en
 * orden (SGRH-110): un tramo por sucursal, y dos bloques si el tramo usa una
 * plantilla con jornada partida. Con horas propias en entrada y salida, un
 * tramo es un solo bloque (mismo criterio del trigger de traslapes).
 *
 * El kiosco usa el cliente ADMIN porque necesita saber si queda un bloque en
 * otra tienda. El panel usa el cliente del usuario para respetar su alcance.
 */
export async function bloquesDelDia(
  supabase: SupabaseServerClient | SupabaseAdminClient,
  employmentHistoryId: number,
  dateISO: string
): Promise<BloquesDelDiaResult> {
  const { data, error } = await supabase
    .from('sgrh_programacion_semanal')
    .select(
      `prg_sucursal_id, prg_es_dia_libre, prg_hora_entrada_custom, prg_hora_salida_custom,
       prg_hora_inicio_break_custom,
       sgrh_cat_horarios ( hor_hora_entrada, hor_hora_salida, hor_hora_entrada_2, hor_hora_salida_2,
         hor_hora_inicio_break )`
    )
    .eq('prg_historial_laboral_id', employmentHistoryId)
    .eq('prg_fecha', dateISO)
    .returns<BloqueProgramacionRow[]>()

  if (error) {
    return { ok: false, error: 'No se pudo cargar la programación del día.' }
  }

  const hhmm = (h: string) => h.slice(0, 5)
  const tramos = (data ?? []).filter((r) => !r.prg_es_dia_libre)
  // Mismo criterio que workingDay: con entrada y salida propias, el receso
  // tambien es el propio (puede no haber); si no, el de la plantilla.
  const tieneReceso = tramos.some((r) =>
    r.prg_hora_entrada_custom && r.prg_hora_salida_custom
      ? r.prg_hora_inicio_break_custom !== null
      : Boolean(r.sgrh_cat_horarios?.hor_hora_inicio_break)
  )
  const bloques = tramos
    .flatMap((r) => {
      const cat = r.sgrh_cat_horarios
      const custom = r.prg_hora_entrada_custom && r.prg_hora_salida_custom
      const entrada = custom ? r.prg_hora_entrada_custom : cat?.hor_hora_entrada
      const salida = custom ? r.prg_hora_salida_custom : cat?.hor_hora_salida
      if (!entrada || !salida) return []
      const branchId = r.prg_sucursal_id
      const primero = { inicio: hhmm(entrada), fin: hhmm(salida), branchId }
      return !custom && cat?.hor_hora_entrada_2 && cat.hor_hora_salida_2
        ? [
            primero,
            { inicio: hhmm(cat.hor_hora_entrada_2), fin: hhmm(cat.hor_hora_salida_2), branchId },
          ]
        : [primero]
    })
    .sort((a, b) => a.inicio.localeCompare(b.inicio))

  return { ok: true, bloques, tieneReceso }
}

/**
 * Si el kiosco puede ofrecer «Inicio receso» ahora: el dia tiene receso y
 * todavia no se tomo. Un receso ya abierto en este bloque lo maneja la
 * secuencia (`allowedNextMarks` ofrece «Fin receso»).
 */
export function breakAvailable(tieneReceso: boolean, recesoTomado: boolean): boolean {
  return tieneReceso && !recesoTomado
}

export function scheduledBlockAtTime(
  blocks: ScheduledBlock[],
  time: string,
  markType: RawMark['tipo']
): ScheduledBlock | undefined {
  const matches = blocks.filter((block) => block.inicio <= time && time <= block.fin)
  if (matches.length === 1) return matches[0]

  // Si los bloques se tocan, la salida cierra uno y la entrada abre el otro.
  const boundary = matches.filter((block) =>
    markType === 'salida' ? block.fin === time : block.inicio === time
  )
  return boundary.length === 1 ? boundary[0] : undefined
}

/**
 * Hora de salida que vale para la ventana de salida del kiosco: la del bloque
 * en curso cuando el dia tiene varios, la del turno cuando tiene uno.
 */
export function salidaDelBloqueActual(
  bloques: { inicio: string; fin: string }[],
  salidasMarcadas: number,
  salidaDelTurno: string | null
): string | null {
  if (bloques.length <= 1) return salidaDelTurno
  return bloques[Math.min(salidasMarcadas, bloques.length - 1)].fin
}

export type ApprovedAbsenceResult = { ok: true; tipo: string | null } | { ok: false; error: string }

interface AusenciaTipoRow {
  sgrh_cat_tipos_ausencia: { tau_nombre: string; tau_es_intradia: boolean } | null
}

/**
 * Nombre del tipo de ausencia aprobada que cubre ese dia para ese contrato
 * (ej. "Incapacidad por Enfermedad"), o null si no hay (SGRH-88).
 *
 * Recibe el cliente ADMIN (createAdminClient): la cuenta KIOSCO no puede leer
 * sgrh_ausencias (observaciones, boletas de la CCSS), y esta bien que no
 * pueda. Solo se llama despues de validar permisos y de confirmar que el
 * contrato tiene turno en la sucursal del kiosco, y solo se lee el nombre del
 * tipo: nada de la ausencia sale de esta funcion. Los tipos intradia
 * (lactancia) no cuentan: se trabaja igual ese dia.
 *
 * Si la consulta falla, error y no "sin ausencia": dejar marcar a alguien
 * incapacitado por un error de red seria el mismo problema que se quiere
 * evitar. El llamador lo trata como fallo pasajero.
 */
export async function findApprovedAbsence(
  admin: SupabaseAdminClient,
  employmentHistoryId: number,
  dateISO: string
): Promise<ApprovedAbsenceResult> {
  const { data, error } = await admin
    .from('sgrh_ausencias')
    .select('sgrh_cat_tipos_ausencia ( tau_nombre, tau_es_intradia )')
    .eq('aus_historial_laboral_id', employmentHistoryId)
    .eq('aus_estado', 'aprobada')
    .lte('aus_fecha_inicio', dateISO)
    .gte('aus_fecha_fin', dateISO)
    .returns<AusenciaTipoRow[]>()

  if (error) {
    return { ok: false, error: 'No se pudo revisar si tenés una ausencia registrada hoy.' }
  }

  const cubre = (data ?? []).find(
    (a) => a.sgrh_cat_tipos_ausencia && !a.sgrh_cat_tipos_ausencia.tau_es_intradia
  )

  return { ok: true, tipo: cubre?.sgrh_cat_tipos_ausencia?.tau_nombre ?? null }
}

/** Lo que ve en el kiosco quien tiene una ausencia aprobada ese dia. */
export function absenceBlocksMarkMessage(tipo: string) {
  return `Tenés registrado "${tipo}" para hoy, así que no podés marcar. Si ya te reincorporaste, avisá al encargado.`
}
