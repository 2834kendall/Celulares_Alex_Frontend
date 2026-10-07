import { z } from 'zod'
import { direccionSchema, type DireccionInput } from '@/modules/employees/types'

// ─── Perfil de la empresa (Configuración → Empresa → Datos de la empresa) ────
//
// La cédula jurídica no está en el schema a propósito: es el identificador
// legal (CCSS, Hacienda) y no se edita desde la app. La RPC tampoco la toca.
//
// La dirección reusa direccionSchema: sgrh_direcciones es una tabla genérica
// compartida por empleados, empresas y sucursales.

/** Los inputs emiten '' vacíos; las columnas opcionales esperan null. */
const optionalText = (max: number, message: string) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string().trim().max(max, message).nullable()
  )

export const companyProfileSchema = z.object({
  org_nombre_social: z
    .string({ error: 'La razón social es obligatoria.' })
    .trim()
    .min(2, 'La razón social es obligatoria.')
    .max(200, 'Máximo 200 caracteres.'),
  org_nombre_fantasia: optionalText(150, 'Máximo 150 caracteres.'),
  org_email_corporativo: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.email('Correo electrónico inválido.').nullable()
  ),
  // Mismo criterio que el teléfono del empleado.
  org_telefono: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z
      .string()
      .regex(/^\+?[\d\s\-()]{7,20}$/, 'Número de teléfono inválido.')
      .nullable()
  ),
  org_representante_legal: optionalText(150, 'Máximo 150 caracteres.'),
  // Código CIIU de la actividad económica (Hacienda), p. ej. 4741.
  org_actividad_economica_ciiu: optionalText(20, 'Máximo 20 caracteres.'),
  direccion: direccionSchema,
})

export type CompanyProfileInput = z.input<typeof companyProfileSchema>
export type CompanyProfileData = z.output<typeof companyProfileSchema>

/** Lo que la página de Configuración necesita para pintar el perfil. */
export interface CompanyProfile {
  org_cedula_juridica: string
  org_nombre_social: string
  org_nombre_fantasia: string | null
  org_email_corporativo: string | null
  org_telefono: string | null
  org_representante_legal: string | null
  org_actividad_economica_ciiu: string | null
  /** null si la empresa todavía no tiene dirección cargada. */
  direccion: DireccionInput | null
  /** URL firmada del logo, o null si no hay (o si no se pudo firmar). */
  logoUrl: string | null
}
