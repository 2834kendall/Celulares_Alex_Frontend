import { z } from 'zod'
import type { Database } from '@/types/database.types'

/**
 * La interseccion con `tau_es_intradia` cubre la columna agregada por la
 * migracion 20260728140000 mientras no se regenere `database.types.ts` con
 * el CLI de Supabase (`supabase gen types`). Una vez regenerado, el campo ya
 * vendra en el tipo base y esta interseccion queda de mas (se puede quitar).
 */
export type AusenciaTypeRow = Database['public']['Tables']['sgrh_cat_tipos_ausencia']['Row'] & {
  tau_es_intradia: boolean
}
export type AusenciaRow = Database['public']['Tables']['sgrh_ausencias']['Row']

const dateRegex = /^\d{4}-\d{2}-\d{2}$/

export const createAusenciaSchema = z
  .object({
    employmentHistoryId: z.number().int().positive(),
    tipoAusenciaId: z.number('Seleccione un tipo.').int().positive(),
    fechaInicio: z.string().regex(dateRegex, 'Formato de fecha invalido (YYYY-MM-DD).'),
    fechaFin: z.string().regex(dateRegex, 'Formato de fecha invalido (YYYY-MM-DD).'),
    numeroBoletaCcss: z.string().trim().max(50).optional(),
    observaciones: z.string().trim().max(300).optional(),
  })
  .refine((data) => data.fechaFin >= data.fechaInicio, {
    message: 'La fecha final debe ser igual o posterior a la fecha de inicio.',
    path: ['fechaFin'],
  })

export type CreateAusenciaInput = z.input<typeof createAusenciaSchema>

const ausenciaRangeSchema = z
  .object({
    fechaInicio: z.string().regex(dateRegex, 'Formato de fecha invalido (YYYY-MM-DD).'),
    fechaFin: z.string().regex(dateRegex, 'Formato de fecha invalido (YYYY-MM-DD).'),
  })
  .refine((range) => range.fechaFin >= range.fechaInicio, {
    message: 'La fecha final debe ser igual o posterior a la fecha de inicio.',
    path: ['fechaFin'],
  })

/**
 * Una incapacidad puede cubrir periodos no continuos (p. ej. lunes a miercoles
 * de una semana y miercoles a jueves de la siguiente). Cada rango se guarda
 * como su propio registro en sgrh_ausencias, que sigue siendo la unidad que se
 * edita, se elimina y se superpone sobre la matriz.
 */
export const createAusenciasBulkSchema = z.object({
  employmentHistoryId: z.number().int().positive(),
  tipoAusenciaId: z.number('Seleccione un tipo.').int().positive(),
  ranges: z.array(ausenciaRangeSchema).min(1, 'Agregue al menos un periodo.'),
  numeroBoletaCcss: z.string().trim().max(50).optional(),
  observaciones: z.string().trim().max(300).optional(),
})

export type CreateAusenciasBulkInput = z.input<typeof createAusenciasBulkSchema>

/** Vista minima de un colaborador para el selector del panel — evita acoplar
 *  el modulo de ausencias al tipo EmployeeWeekRow del modulo de horarios. */
export interface EmployeeOption {
  employmentHistoryId: number
  fullName: string
  position: string | null
  branchName: string | null
}
