import { z } from 'zod'
import { ASSIGNABLE_PERMISSIONS } from './permissions'

const assignable = new Set<string>(ASSIGNABLE_PERMISSIONS)

export const roleSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(2, 'Escribí el nombre del rol.')
    .max(60, 'El nombre no puede pasar de 60 caracteres.'),
  descripcion: z.string().trim().max(200, 'La descripción no puede pasar de 200 caracteres.'),
  /** null = el rol sirve para toda la empresa. */
  sucursalId: z.number().int().positive().nullable(),
  permisos: z
    .array(z.string())
    .refine(
      (list) => list.every((p) => assignable.has(p)),
      'Hay un permiso que no se puede asignar.'
    ),
})

export type RoleInput = z.infer<typeof roleSchema>

/** Un rol tal como lo muestran el listado y el editor. */
export interface RoleSummary {
  id: number
  nombre: string
  descripcion: string | null
  /** Rol del sistema: compartido, solo lectura (se duplica para editarlo). */
  sistema: boolean
  /** false = no se puede asignar a cuentas desde Usuarios (p. ej. Kiosco). */
  asignable: boolean
  sucursalId: number | null
  sucursalNombre: string | null
  /** En la versión de sucursal de un rol: el rol del que salió. */
  baseId: number | null
  baseNombre: string | null
  permisos: string[]
  /** Cuentas activas de ESTA empresa con el rol. */
  usuarios: number
}

export interface RoleBranch {
  id: number
  nombre: string
  activa: boolean
}

export interface RolesSettings {
  propios: RoleSummary[]
  sistema: RoleSummary[]
  sucursales: RoleBranch[]
  /** Rol activo de quien edita (para la guarda de no quitarse ROLES_WRITE). */
  actorRolId: number | null
  /** Permisos vivos de quien edita: no puede otorgar lo que no tiene. */
  actorPermisos: string[]
}

/** Resultado de personalizar un rol para una sucursal. */
export interface CustomizeResult {
  id: number
  /** false = la versión ya existía y solo se devuelve su id. */
  creado: boolean
  /** Cuentas que pasaron a la versión de la sucursal. */
  movidos: number
  /** Cuentas con el rol base en varias sucursales: se quedan en el base. */
  omitidos: number
}

export type RoleResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string }
