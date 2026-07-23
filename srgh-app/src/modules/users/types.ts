import { z } from 'zod'

// ─── Módulo de usuarios (cuentas de acceso al sistema) ───────────────────────
// Dominio separado de la ficha de empleado: aquí se gestionan cuentas, roles
// y acceso (sgrh_usuarios + sgrh_usuarios_empresa_rol). La UI vive como tab
// dentro de /employees, pero el código queda aislado por si algún día se
// separa en su propia ruta.

// Supabase Auth almacena los emails en minúsculas; sin normalizar aquí, el
// vínculo posterior por usr_email no matchearía con mayúsculas en el input.
// El trim va ANTES de validar (un espacio accidental no debe invalidar).
const emailNormalizado = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim() : value),
  z.email('Correo electrónico inválido').transform((value) => value.toLowerCase())
)

const rolId = z
  .number({ error: 'El rol es obligatorio' })
  .int()
  .positive('Seleccione un rol válido')

const sucursalId = z.number().int().positive('Seleccione una sucursal válida').nullable().optional()

// Los selects opcionales entregan '' o NaN cuando no hay elección; ambos
// significan "sin vínculo" y se normalizan a null antes de validar.
const empleadoId = z.preprocess(
  (value) => (value === '' || (typeof value === 'number' && Number.isNaN(value)) ? null : value),
  z.number().int().positive('Seleccione un empleado válido').nullable().optional()
)

// ─── Schema de invitación ─────────────────────────────────────────────────────
// El alta real la hace supabase.auth.admin.inviteUserByEmail; el trigger
// handle_new_auth_user crea/vincula la fila de sgrh_usuarios por email.
// La unicidad del email NO se pre-chequea contra sgrh_usuarios: el árbitro es
// el email_exists de Auth (el ON CONFLICT del trigger re-vincula filas
// huérfanas, base del flujo de reenviar invitación).

export const invitarUsuarioSchema = z.object({
  email: emailNormalizado,
  rol_id: rolId,
  sucursal_id: sucursalId,
  empleado_id: empleadoId,
})

export type InvitarUsuarioInput = z.infer<typeof invitarUsuarioSchema>

// ─── Schema de edición de asignación ─────────────────────────────────────────
// Edita la fila uer EXISTENTE (rol/sucursal) y el vínculo con el empleado.
// El email nunca se edita: es la identidad de la cuenta en Auth.

export const editarAsignacionSchema = z.object({
  rol_id: rolId,
  sucursal_id: sucursalId,
  empleado_id: empleadoId,
})

export type EditarAsignacionInput = z.infer<typeof editarAsignacionSchema>

// ─── View Model — Listado de usuarios ────────────────────────────────────────
// El estado cruza ambas fuentes de verdad: 'desactivado' sale de NUESTROS
// flags (usr_activo/uer_activo); 'pendiente' solo puede decirlo Auth
// (last_sign_in_at — usr_ultimo_acceso no lo actualiza nadie hoy).

export type UsuarioEstado = 'activo' | 'pendiente' | 'desactivado'

export interface UsuarioListItem {
  usr_id: number
  email: string
  empleado_id: number | null
  empleado_nombre: string | null
  rol_id: number
  rol_nombre: string
  sucursal_id: number | null
  sucursal_nombre: string | null
  estado: UsuarioEstado
  ultimo_acceso: string | null
}

// ─── View Model — Empleados activos sin usuario ──────────────────────────────
// Alimenta el bloque "crear usuario" con la invitación precargada.

export interface EmpleadoSinUsuario {
  emp_id: number
  nombre_completo: string
  email_personal: string | null
  puesto_nombre: string | null
}
