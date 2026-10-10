import { describe, expect, it } from 'vitest'
import { accessExit } from './accessExit'

describe('accessExit', () => {
  it('sin sesión ofrece iniciar sesión', () => {
    expect(accessExit(null)).toBe('login')
    expect(accessExit(undefined)).toBe('login')
  })

  it('con permisos, aunque no el de la sección, vuelve al inicio', () => {
    expect(accessExit({ app_metadata: { permisos: ['EMPLEADOS_READ'] } })).toBe('home')
  })

  it('con sesión y sin ningún permiso solo queda cerrar sesión', () => {
    expect(accessExit({ app_metadata: { permisos: [] } })).toBe('logout')
  })

  it('claims sin app_metadata o con permisos mal formados cuentan como sin permisos', () => {
    expect(accessExit({})).toBe('logout')
    expect(accessExit({ app_metadata: { permisos: 'EMPLEADOS_READ' } })).toBe('logout')
  })
})
