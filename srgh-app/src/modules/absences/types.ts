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

// ─── Catálogo de tipos de ausencia (Configuración → Horarios → Tipos de incapacidad) ───

/** Los inputs numéricos vacíos llegan como NaN o ''; las columnas opcionales esperan null. */
const optionalNumber = (schema: z.ZodNumber) =>
  z.preprocess(
    (value) => (value === '' || value == null || Number.isNaN(value) ? null : value),
    schema.nullable()
  )

const percent = (message: string) => z.number(message).min(0, 'Mínimo 0%.').max(100, 'Máximo 100%.')

export const tipoAusenciaSchema = z
  .object({
    // Identificador estable (la nómina busca INC_ENF por código): se fija al crear y no se edita.
    tau_codigo: z
      .string('El código es requerido.')
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_]{2,20}$/, 'Use 2 a 20 letras, números o guion bajo.'),
    tau_nombre: z
      .string('El nombre es requerido.')
      .trim()
      .min(2, 'El nombre es requerido.')
      .max(100, 'Máximo 100 caracteres.'),
    tau_requiere_documento_ccss: z.boolean().default(false),
    tau_paga_empleador_dias: z
      .number('Indique los días que paga el patrono (0 si ninguno).')
      .int('Tiene que ser un número entero.')
      .min(0, 'Mínimo 0 días.')
      .max(365, 'Máximo 365 días.'),
    tau_porcentaje_pago_empleador: percent('Indique el porcentaje que paga el patrono.'),
    tau_paga_ccss_desde_dia: optionalNumber(
      z.number().int('Tiene que ser un número entero.').min(1, 'Mínimo el día 1.').max(365)
    ),
    tau_porcentaje_subsidio_ccss: optionalNumber(percent('Porcentaje inválido.')),
    tau_descuenta_vacaciones: z.boolean().default(false),
    tau_es_protegida: z.boolean().default(false),
    tau_es_intradia: z.boolean().default(false),
    tau_referencia_legal: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
      z.string().trim().max(200, 'Máximo 200 caracteres.').nullable()
    ),
  })
  .refine(
    (data) =>
      (data.tau_paga_ccss_desde_dia === null) === (data.tau_porcentaje_subsidio_ccss === null),
    {
      message: 'Indique el día de inicio y el porcentaje del subsidio, o deje ambos vacíos.',
      path: ['tau_porcentaje_subsidio_ccss'],
    }
  )

export type TipoAusenciaInput = z.input<typeof tipoAusenciaSchema>

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
