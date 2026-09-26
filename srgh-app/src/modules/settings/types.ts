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

export type TipoTardiaRow = Database['public']['Tables']['sgrh_cat_tipos_tardia']['Row']

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

/**
 * Un tipo de tardia del catalogo. Solo se pide el minuto donde EMPIEZA: donde
 * termina se deduce del siguiente tipo, asi el formulario no puede producir
 * huecos ni solapamientos (ver la migracion del catalogo).
 */
export const tipoTardiaSchema = z.object({
  tta_nombre: z
    .string('El nombre es requerido.')
    .trim()
    .min(2, 'El nombre es requerido.')
    .max(60, 'Maximo 60 caracteres.'),
  tta_desde_minutos: z
    .number('Indique desde que minuto de atraso empieza.')
    .int('Tiene que ser un numero entero de minutos.')
    .min(1, 'Tiene que empezar en el minuto 1 o despues.')
    .max(720, 'Maximo 720 minutos (12 horas).'),
  tta_cuenta_advertencia: z.boolean().default(true),
  tta_color: z.string().regex(HEX_COLOR, 'Color invalido.').nullable().default(null),
})

export type TipoTardiaInput = z.input<typeof tipoTardiaSchema>
