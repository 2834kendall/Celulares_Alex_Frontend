import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PERMISOS } from '@/lib/permissions/catalog'
import {
  ASSIGNABLE_PERMISSIONS,
  PERMISSION_GROUPS,
  REQUISITOS,
  checkPermission,
  dependentsOf,
  uncheckPermission,
  withRequirements,
} from './permissions'

describe('catálogo del editor', () => {
  it('muestra todos los permisos del sistema menos el del kiosco, una sola vez', () => {
    const todos = Object.values(PERMISOS).filter((p) => p !== PERMISOS.ASISTENCIA_KIOSCO)
    expect([...ASSIGNABLE_PERMISSIONS].sort()).toEqual([...todos].sort())
    expect(new Set(ASSIGNABLE_PERMISSIONS).size).toBe(ASSIGNABLE_PERMISSIONS.length)
  })

  it('cada permiso tiene un nombre en lenguaje llano, no el código', () => {
    for (const item of PERMISSION_GROUPS.flatMap((g) => g.items)) {
      expect(item.label).not.toMatch(/_/)
    }
  })

  it('las dependencias son las mismas que valida la RPC', () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase/migrations/20261109031500_roles_por_empresa.sql'),
      'utf8'
    )
    const cuerpo = sql.slice(
      sql.indexOf('permiso_requisitos()'),
      sql.indexOf('$$;', sql.indexOf('permiso_requisitos()'))
    )
    const pares = [...cuerpo.matchAll(/\('([A-Z_]+)',\s*'([A-Z_]+)'\)/g)].map(
      (m) => `${m[1]}>${m[2]}`
    )
    const ts = Object.entries(REQUISITOS).map(([p, r]) => `${p}>${r}`)
    expect(pares.sort()).toEqual(ts.sort())
  })
})

describe('dependencias entre casillas', () => {
  it('marcar «Editar» marca «Ver»', () => {
    expect(checkPermission([], PERMISOS.EMPLEADOS_WRITE)).toEqual([
      PERMISOS.EMPLEADOS_READ,
      PERMISOS.EMPLEADOS_WRITE,
    ])
  })

  it('las dependencias se encadenan', () => {
    expect(checkPermission([], PERMISOS.DOCUMENTOS_WRITE)).toEqual([
      PERMISOS.EMPLEADOS_READ,
      PERMISOS.DOCUMENTOS_READ,
      PERMISOS.DOCUMENTOS_WRITE,
    ])
  })

  it('desmarcar «Ver» desmarca, en cadena, lo que dependía de él', () => {
    const con = [
      PERMISOS.EMPLEADOS_READ,
      PERMISOS.DOCUMENTOS_READ,
      PERMISOS.DOCUMENTOS_WRITE,
      PERMISOS.NOMINA_READ,
    ]
    expect(uncheckPermission(con, PERMISOS.EMPLEADOS_READ)).toEqual([PERMISOS.NOMINA_READ])
  })

  it('desmarcar uno sin dependientes no toca nada más', () => {
    const con = [PERMISOS.EMPLEADOS_READ, PERMISOS.EMPLEADOS_WRITE]
    expect(uncheckPermission(con, PERMISOS.EMPLEADOS_WRITE)).toEqual([PERMISOS.EMPLEADOS_READ])
  })

  it('dependentsOf anticipa lo que arrastra una casilla', () => {
    expect(dependentsOf(PERMISOS.NOMINA_READ)).toEqual([
      PERMISOS.NOMINA_WRITE,
      PERMISOS.NOMINA_APPROVE,
    ])
    expect(dependentsOf(PERMISOS.REPORTES_READ)).toEqual([])
  })

  it('al duplicar, completa dependencias y descarta lo no asignable', () => {
    expect(
      withRequirements([PERMISOS.HORARIOS_WRITE, PERMISOS.ASISTENCIA_KIOSCO, 'INVENTADO'])
    ).toEqual([PERMISOS.HORARIOS_READ, PERMISOS.HORARIOS_WRITE])
  })
})
