import { z } from 'zod'
import type { Database } from '@/types/database.types'

export const brandSchema = z.object({
  mco_nombre: z
    .string()
    .trim()
    .min(2, 'Escribí el nombre de la marca.')
    .max(80, 'El nombre de la marca no puede pasar de 80 caracteres.'),
  mco_activa: z.boolean(),
})
export type BrandInput = z.infer<typeof brandSchema>

export type BrandBranch = { suc_id: number; suc_nombre: string; suc_activa: boolean }

export type Brand = Database['public']['Tables']['sgrh_marcas_comerciales']['Row'] & {
  sucursales: BrandBranch[]
  /** URL firmada del logo (no la ruta), o null. */
  logoUrl: string | null
}

export type BrandSettings = { brands: Brand[] }

/** Lo que una marca hereda de la empresa si no lo personalizó. */
export type BrandsEmpresa = { acento: string; sidebar: string; logoUrl: string | null }
