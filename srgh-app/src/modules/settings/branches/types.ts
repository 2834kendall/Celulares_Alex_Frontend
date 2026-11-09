import { z } from 'zod'
import { direccionSchema } from '@/modules/employees/types'
import type { Database } from '@/types/database.types'

const text = (max: number) => z.string().trim().max(max)
export const branchSchema = z
  .object({
    suc_nombre: text(100).min(2, 'Escribí el nombre de la sucursal.'),
    // El vacío del select llega como NaN (ver CatalogSelect): lo rechaza `.int()`.
    suc_marca_id: z
      .number({ error: 'Elegí la marca de la sucursal.' })
      .int('Elegí la marca de la sucursal.')
      .positive('Elegí la marca de la sucursal.'),
    suc_codigo_interno: text(40),
    suc_telefono: text(30),
    suc_email_sucursal: z.union([z.literal(''), z.email()]),
    suc_latitud: z.number().min(-90).max(90).nullable(),
    suc_longitud: z.number().min(-180).max(180).nullable(),
    suc_radio_geocerca_metros: z.number().int().min(1).max(10000),
    suc_activa: z.boolean(),
    direccion: direccionSchema,
  })
  .refine((d) => (d.suc_latitud === null) === (d.suc_longitud === null), {
    message: 'Ingresá ambas coordenadas o dejá ambas vacías.',
    path: ['suc_latitud'],
  })
export type BranchInput = z.infer<typeof branchSchema>
export type Branch = Database['public']['Tables']['sgrh_sucursales']['Row'] & {
  direccion: { dir_distrito_id: number; dir_senas_exactas: string | null } | null
  contratos: number
  programaciones: number
}
export type Kiosk = Database['public']['Tables']['sgrh_kioscos']['Row']
export type Audit = Database['public']['Tables']['sgrh_config_auditoria']['Row']
export const kioskSchema = z.object({
  nombre: text(80).min(2, 'Escribí el nombre del kiosco.'),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  sucursal_id: z.number().int().positive(),
})
export type KioskInput = z.infer<typeof kioskSchema>
export type LegacyKiosk = { id: number; email: string; sucursales: (number | null)[] }
/** Marca elegible en el formulario de sucursal. */
export type BranchBrand = { id: number; nombre: string; activa: boolean }
export type BranchSettings = {
  branches: Branch[]
  brands: BranchBrand[]
  kiosks: Kiosk[]
  legacy: LegacyKiosk[]
  audit: Audit[]
  canManageKiosks: boolean
}
