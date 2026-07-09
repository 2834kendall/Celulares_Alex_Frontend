import { z } from 'zod'
import type { Database } from '@/types/database.types'

export type ScheduleRow = Database['public']['Tables']['sgrh_cat_horarios']['Row']

const horaRegex = /^([01]\d|2[0-3]):([0-5]\d)$/

export const scheduleSchema = z
  .object({
    hor_nombre: z.string('El nombre es requerido.').trim().min(3).max(100),
    hor_tipo_jornada_id: z.number('Seleccione un tipo de jornada.').int().positive(),
    hor_hora_entrada: z.string().regex(horaRegex, 'Formato de hora invalido (HH:mm).'),
    hor_hora_salida: z.string().regex(horaRegex, 'Formato de hora invalido (HH:mm).'),
    hor_hora_inicio_almuerzo: z.string().regex(horaRegex, 'Formato de hora invalido (HH:mm).'),
    hor_hora_fin_almuerzo: z.string().regex(horaRegex, 'Formato de hora invalido (HH:mm).'),
    hor_duracion_almuerzo_min: z.number().int().min(0).default(60),
    hor_hora_inicio_break: z.string().regex(horaRegex).nullable().optional(),
    hor_hora_fin_break: z.string().regex(horaRegex).nullable().optional(),
    hor_duracion_break_min: z.number().int().min(0).default(15),
    hor_activo: z.boolean().default(true),
  })
  .refine((data) => data.hor_hora_salida > data.hor_hora_entrada, {
    message: 'La hora de salida debe ser posterior a la hora de entrada.',
    path: ['hor_hora_salida'],
  })

export type ScheduleInput = z.input<typeof scheduleSchema>
