import { z } from 'zod'
import type { Database } from '@/types/database.types'

export type ScheduleRow = Database['public']['Tables']['sgrh_cat_horarios']['Row']

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/
const hexColorRegex = /^#[0-9a-fA-F]{6}$/

/** Empty string is allowed too, so the field can be cleared/left blank in the form. */
const optionalTime = z
  .string()
  .refine((val) => val === '' || timeRegex.test(val), {
    message: 'Formato de hora invalido (HH:mm).',
  })
  .nullable()
  .optional()

export const scheduleSchema = z
  .object({
    hor_nombre: z.string('El nombre es requerido.').trim().min(3).max(100),
    hor_tipo_jornada_id: z.number('Seleccione un tipo de jornada.').int().positive(),
    hor_hora_entrada: z.string().regex(timeRegex, 'Formato de hora invalido (HH:mm).'),
    hor_hora_salida: z.string().regex(timeRegex, 'Formato de hora invalido (HH:mm).'),
    /** Segundo bloque (jornada partida): las dos horas o ninguna. */
    hor_hora_entrada_2: optionalTime,
    hor_hora_salida_2: optionalTime,
    /**
     * Sucursal de cada bloque de la jornada partida: las dos o ninguna. null =
     * la sucursal con la que se asigne la plantilla.
     */
    hor_sucursal_id: z.number().int().positive().nullable().optional(),
    hor_sucursal_id_2: z.number().int().positive().nullable().optional(),
    hor_hora_inicio_almuerzo: z.string().regex(timeRegex, 'Formato de hora invalido (HH:mm).'),
    hor_hora_fin_almuerzo: z.string().regex(timeRegex, 'Formato de hora invalido (HH:mm).'),
    hor_duracion_almuerzo_min: z.number().int().min(0).default(60),
    hor_hora_inicio_break: optionalTime,
    hor_hora_fin_break: optionalTime,
    hor_duracion_break_min: z.number().int().min(0).default(10),
    hor_activo: z.boolean().default(true),
    /** null = sin color propio, la matriz semanal asigna uno automatico por hor_id. */
    hor_color: z.string().regex(hexColorRegex, 'Color invalido.').nullable().optional(),
  })
  .refine((data) => data.hor_hora_salida > data.hor_hora_entrada, {
    message: 'La hora de salida debe ser posterior a la hora de entrada.',
    path: ['hor_hora_salida'],
  })
  .refine((data) => Boolean(data.hor_hora_entrada_2) === Boolean(data.hor_hora_salida_2), {
    message: 'Indique la entrada y la salida del segundo bloque.',
    path: ['hor_hora_salida_2'],
  })
  .refine(
    (data) =>
      !data.hor_hora_entrada_2 ||
      !data.hor_hora_salida_2 ||
      data.hor_hora_salida_2 > data.hor_hora_entrada_2,
    {
      message: 'La salida del segundo bloque debe ser posterior a su entrada.',
      path: ['hor_hora_salida_2'],
    }
  )
  .refine((data) => !data.hor_hora_entrada_2 || data.hor_hora_entrada_2 >= data.hor_hora_salida, {
    message: 'El segundo bloque debe empezar cuando termina el primero o despues.',
    path: ['hor_hora_entrada_2'],
  })
  .refine(
    (data) =>
      !data.hor_hora_entrada_2 ||
      !data.hor_hora_salida_2 ||
      data.hor_hora_salida > data.hor_hora_entrada,
    {
      message: 'Con segundo bloque, el primero no puede cruzar la medianoche.',
      path: ['hor_hora_salida'],
    }
  )
  .refine((data) => Boolean(data.hor_sucursal_id) === Boolean(data.hor_sucursal_id_2), {
    message: 'Elija la sucursal de los dos bloques, o deje las dos como la de la asignacion.',
    path: ['hor_sucursal_id_2'],
  })
  .refine((data) => !data.hor_sucursal_id || Boolean(data.hor_hora_entrada_2), {
    message: 'Las sucursales por bloque solo aplican a una jornada partida.',
    path: ['hor_sucursal_id'],
  })
  .refine(
    (data) =>
      !data.hor_hora_inicio_break ||
      !data.hor_hora_fin_break ||
      data.hor_hora_fin_break > data.hor_hora_inicio_break,
    {
      message: 'El fin del break debe ser posterior al inicio.',
      path: ['hor_hora_fin_break'],
    }
  )

export type ScheduleInput = z.input<typeof scheduleSchema>
export type ScheduleOutput = z.output<typeof scheduleSchema>

function minutesBetween(from: string, to: string): number {
  const [h1, m1] = from.split(':').map(Number)
  const [h2, m2] = to.split(':').map(Number)
  return h2 * 60 + m2 - (h1 * 60 + m1)
}

/**
 * Prepara una plantilla validada para guardarla. Los horarios de un solo bloque
 * pasan igual (solo se normalizan las horas opcionales vacias a NULL). En una
 * jornada partida el almuerzo es el hueco entre los dos bloques (las columnas
 * del almuerzo son obligatorias) y no lleva break.
 */
export function toScheduleColumns(data: ScheduleOutput) {
  const entrada2 = parseOptionalTime(data.hor_hora_entrada_2)
  const salida2 = parseOptionalTime(data.hor_hora_salida_2)

  if (entrada2 && salida2) {
    return {
      ...data,
      hor_hora_entrada_2: entrada2,
      hor_hora_salida_2: salida2,
      hor_hora_inicio_almuerzo: data.hor_hora_salida,
      hor_hora_fin_almuerzo: entrada2,
      hor_duracion_almuerzo_min: minutesBetween(data.hor_hora_salida, entrada2),
      hor_hora_inicio_break: null,
      hor_hora_fin_break: null,
      hor_sucursal_id: data.hor_sucursal_id ?? null,
      hor_sucursal_id_2: data.hor_sucursal_id_2 ?? null,
    }
  }

  return {
    ...data,
    hor_hora_entrada_2: null,
    hor_hora_salida_2: null,
    hor_sucursal_id: null,
    hor_sucursal_id_2: null,
    hor_hora_inicio_break: parseOptionalTime(data.hor_hora_inicio_break),
    hor_hora_fin_break: parseOptionalTime(data.hor_hora_fin_break),
  }
}

/** Converts the input string (or empty) into the nullable time the database expects. */
export function parseOptionalTime(value: string | null | undefined): string | null {
  return value === undefined || value === null || value.trim() === '' ? null : value
}

export type ShiftTypeRow = Database['public']['Tables']['sgrh_cat_tipos_jornada']['Row']

const optionalPositiveHours = z
  .string()
  .optional()
  .refine(
    (val) =>
      val === undefined || val.trim() === '' || (Number.isFinite(Number(val)) && Number(val) > 0),
    { message: 'Debe ser un numero positivo.' }
  )

export const shiftTypeSchema = z.object({
  tjo_codigo: z
    .string('El codigo es requerido.')
    .trim()
    .min(2, 'El codigo es requerido.')
    .max(30, 'Maximo 30 caracteres.')
    .regex(/^[A-Z_]+$/, 'Use mayusculas y guion bajo (ej: JORNADA_MIXTA).'),
  tjo_nombre: z.string('El nombre es requerido.').trim().min(3, 'El nombre es requerido.').max(100),
  tjo_horas_max_diarias: optionalPositiveHours,
  tjo_horas_max_semanales: optionalPositiveHours,
  tjo_recargo_porcentaje: z.number('El recargo es requerido.').min(0).max(100).default(0),
})

export type ShiftTypeInput = z.input<typeof shiftTypeSchema>

/** Converts the input string (or empty) into the nullable number the database expects. */
export function parseOptionalHours(value: string | undefined): number | null {
  return value === undefined || value.trim() === '' ? null : Number(value)
}

const dateRegex = /^\d{4}-\d{2}-\d{2}$/

export const assignDayScheduleSchema = z.object({
  assignmentId: z.number().int().positive().nullable(),
  employmentHistoryId: z.number().int().positive(),
  employeeId: z.number().int().positive(),
  branchId: z.number().int().positive(),
  date: z.string().regex(dateRegex, 'Formato de fecha invalido (YYYY-MM-DD).'),
  scheduleId: z.number().int().positive().nullable(),
  isDayOff: z.boolean(),
  customStartTime: z
    .string()
    .regex(timeRegex, 'Formato de hora invalido (HH:mm).')
    .nullable()
    .optional(),
  customEndTime: z
    .string()
    .regex(timeRegex, 'Formato de hora invalido (HH:mm).')
    .nullable()
    .optional(),
  customLunchStart: optionalTime,
  customLunchEnd: optionalTime,
  customBreakStart: optionalTime,
  customBreakEnd: optionalTime,
})

export type AssignDayInput = z.input<typeof assignDayScheduleSchema>

/**
 * Asigna una plantilla partida cuyos dos bloques tienen sucursales distintas
 * (las de la propia plantilla): por ejemplo 7-11 en Infinity y 16-20 en Alex.
 * Se guarda como dos tramos, cada uno con las horas de su bloque.
 */
export const assignSplitScheduleSchema = z.object({
  /** Fila que se reemplaza con el primer bloque (null si el dia no tenia tramo ahi). */
  assignmentId: z.number().int().positive().nullable(),
  employmentHistoryId: z.number().int().positive(),
  employeeId: z.number().int().positive(),
  date: z.string().regex(dateRegex, 'Formato de fecha invalido (YYYY-MM-DD).'),
  scheduleId: z.number().int().positive(),
})

export type AssignSplitScheduleInput = z.input<typeof assignSplitScheduleSchema>

const customTimeFields = {
  customStartTime: z.string().regex(timeRegex, 'Formato de hora invalido (HH:mm).'),
  customEndTime: z.string().regex(timeRegex, 'Formato de hora invalido (HH:mm).'),
  customLunchStart: optionalTime,
  customLunchEnd: optionalTime,
  customBreakStart: optionalTime,
  customBreakEnd: optionalTime,
}

/**
 * Aplica un horario personalizado a varios dias de la semana visible en una
 * sola confirmacion (en vez de repetir el flujo de assignDaySchedule dia por dia).
 */
export const assignCustomScheduleBulkSchema = z.object({
  employmentHistoryId: z.number().int().positive(),
  employeeId: z.number().int().positive(),
  branchId: z.number().int().positive(),
  days: z
    .array(
      z.object({
        assignmentId: z.number().int().positive().nullable(),
        date: z.string().regex(dateRegex, 'Formato de fecha invalido (YYYY-MM-DD).'),
      })
    )
    .min(1, 'Seleccione al menos un dia.'),
  ...customTimeFields,
})

export type AssignCustomScheduleBulkInput = z.input<typeof assignCustomScheduleBulkSchema>

/** Tope de tramos de un mismo dia: uno por sucursal, y nadie trabaja en tantas. */
const MAX_TRAMOS_POR_DIA = 10

// Lo que describe a un tramo: su sucursal y su horario (de catalogo o a medida).
const pasteTramoFields = {
  // Sucursal de este tramo; puede rotar respecto a la de casa del colaborador.
  branchId: z.number().int().positive(),
  scheduleId: z.number().int().positive().nullable(),
  customStartTime: z
    .string()
    .regex(timeRegex, 'Formato de hora invalido (HH:mm).')
    .nullable()
    .optional(),
  customEndTime: z
    .string()
    .regex(timeRegex, 'Formato de hora invalido (HH:mm).')
    .nullable()
    .optional(),
  customLunchStart: optionalTime,
  customLunchEnd: optionalTime,
  customBreakStart: optionalTime,
  customBreakEnd: optionalTime,
}

// Tramo adicional de un dia (SGRH-110): siempre trabajado, nunca descanso ni vacio.
const pasteExtraTramoSchema = z
  .object(pasteTramoFields)
  .refine(
    (tramo) => tramo.scheduleId != null || Boolean(tramo.customStartTime && tramo.customEndTime),
    { message: 'Un tramo adicional necesita un horario.' }
  )

const pasteDaySchema = z
  .object({
    // Fila destino del PRIMER tramo del dia (null si el dia no tiene fila todavia).
    assignmentId: z.number().int().positive().nullable(),
    date: z.string().regex(dateRegex, 'Formato de fecha invalido (YYYY-MM-DD).'),
    isDayOff: z.boolean(),
    ...pasteTramoFields,
    // Los demas tramos del dia que se copian (SGRH-110).
    extraTramos: z.array(pasteExtraTramoSchema).max(MAX_TRAMOS_POR_DIA).optional(),
    // Filas que el destino ya tiene como tramos adicionales de ese dia: se
    // reemplazan por las de arriba, para que pegar deje el dia igual al origen.
    replaceTramoIds: z.array(z.number().int().positive()).max(MAX_TRAMOS_POR_DIA).optional(),
  })
  .refine((day) => !(day.isDayOff && (day.extraTramos?.length ?? 0) > 0), {
    message: 'Un dia libre no puede tener otros tramos.',
  })

/**
 * Aplica, en una sola confirmacion, un conjunto de dias por colaborador —
 * usado tanto por "pegar" (lo copiado de otra semana) como por "generar
 * sugerido" (lo calculado a partir del historial). Un colaborador sin dias
 * disponibles para pegar (todos bloqueados por ausencia, o sin sugerencia)
 * simplemente no aparece en `employees`.
 */
export const pasteWeeklyScheduleSchema = z.object({
  employees: z
    .array(
      z.object({
        employmentHistoryId: z.number().int().positive(),
        employeeId: z.number().int().positive(),
        days: z.array(pasteDaySchema).min(1).max(7),
      })
    )
    .min(1, 'No hay dias disponibles para aplicar.'),
})

export type PasteWeeklyScheduleInput = z.input<typeof pasteWeeklyScheduleSchema>
