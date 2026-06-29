export interface SgrhJwtClaims {
  usr_id: number
  emp_id: number | null
  rol: string
  empresa_id: number
  permisos: string[]
}
