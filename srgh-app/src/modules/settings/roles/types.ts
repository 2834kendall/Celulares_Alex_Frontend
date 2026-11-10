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
  /**
   * Rol sin empresa. De esos solo se lista el del kiosco (cuenta de tablet),
   * de solo lectura; los demás son plantillas y no llegan a la pantalla.
   */
  sistema: boolean
  /** false = no se puede asignar a cuentas desde Usuarios (p. ej. Kiosco). */
  asignable: boolean
  permisos: string[]
  /** Cuentas activas de ESTA empresa con el rol. */
  usuarios: number
}

export interface RolesSettings {
  /**
   * Roles vigentes de la empresa. Valen para toda ella: hasta dónde ve cada
   * cuenta lo decide la sucursal de la cuenta, no el rol.
   */
  propios: RoleSummary[]
  /** Solo el rol del kiosco. */
  sistema: RoleSummary[]
  /** Rol activo de quien edita (para la guarda de no quitarse ROLES_WRITE). */
  actorRolId: number | null
  /** Permisos vivos de quien edita: no puede otorgar lo que no tiene. */
  actorPermisos: string[]
}

export type RoleResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string }
