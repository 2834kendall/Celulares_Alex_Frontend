import { z } from 'zod'
import type { Database } from '@/types/database.types'

export type PuestoRow = Database['public']['Tables']['sgrh_cat_puestos']['Row']

const optionalPositiveSalary = z
  .string()
  .optional()
  .refine(
    (val) =>
      val === undefined || val.trim() === '' || (Number.isFinite(Number(val)) && Number(val) > 0),
    { message: 'Debe ser un numero positivo.' }
  )

export const puestoSchema = z.object({
  pue_nombre: z
    .string('El nombre es requerido.')
    .trim()
    .min(2, 'El nombre es requerido.')
    .max(150, 'Maximo 150 caracteres.'),
  pue_descripcion: z.string().trim().max(500, 'Maximo 500 caracteres.').optional(),
  pue_salario_minimo_referencia: optionalPositiveSalary,
  pue_activo: z.boolean().default(true),
})

export type PuestoInput = z.input<typeof puestoSchema>

/** Convierte el input string (o vacio) al numero nullable que espera la base. */
export function parseOptionalSalary(value: string | undefined): number | null {
  return value === undefined || value.trim() === '' ? null : Number(value)
}
