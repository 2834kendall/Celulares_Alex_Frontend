export interface SgrhJwtClaims {
  usr_id: number
  emp_id: number | null
  rol: string
  empresa_id: number
  /**
   * Sucursal a la que está adscrito el usuario, o null si opera a nivel
   * empresa (ADMIN). El null es semántico: significa "sin restricción de
   * sucursal", y así lo interpretan las policies vía public.sucursal_visible().
   *
   * Viene del hook custom_access_token_hook, que lo lee de
   * sgrh_usuarios_empresa_rol.uer_sucursal_id.
   */
  sucursal_id: number | null
  permisos: string[]
}
