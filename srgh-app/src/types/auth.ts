export interface SgrhJwtClaims {
  usr_id: number
  emp_id: number | null
  rol: string
  empresa_id: number
  /**
   * Sucursales a las que está adscrito el usuario, o null si opera a nivel
   * empresa (ADMIN, o cualquier fila activa sin sucursal asignada). El null
   * es semántico: significa "sin restricción de sucursal", y así lo
   * interpretan las policies vía public.sucursal_visible().
   *
   * Viene del hook custom_access_token_hook, que agrega TODAS las filas
   * activas de sgrh_usuarios_empresa_rol.uer_sucursal_id del usuario en su
   * empresa (un gerente puede estar a cargo de más de una sucursal).
   */
  sucursal_ids: number[] | null
  permisos: string[]
}
