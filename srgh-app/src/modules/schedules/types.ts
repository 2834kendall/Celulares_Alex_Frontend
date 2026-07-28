import { z } from 'zod'
import type { Database } from '@/types/database.types'

export type ScheduleRow = Database['public']['Tables']['sgrh_cat_horarios']['Row']

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/

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
    hor_hora_inicio_almuerzo: z.string().regex(timeRegex, 'Formato de hora invalido (HH:mm).'),
    hor_hora_fin_almuerzo: z.string().regex(timeRegex, 'Formato de hora invalido (HH:mm).'),
    hor_duracion_almuerzo_min: z.number().int().min(0).default(60),
    hor_hora_inicio_break: optionalTime,
    hor_hora_fin_break: optionalTime,
    hor_duracion_break_min: z.number().int().min(0).default(15),
    hor_activo: z.boolean().default(true),
  })
  .refine((data) => data.hor_hora_salida > data.hor_hora_entrada, {
    message: 'La hora de salida debe ser posterior a la hora de entrada.',
    path: ['hor_hora_salida'],
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
