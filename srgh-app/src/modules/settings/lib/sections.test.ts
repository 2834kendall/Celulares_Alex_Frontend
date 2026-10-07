import { describe, expect, it } from 'vitest'
import { PERMISOS } from '@/lib/permissions/catalog'
import {
  SETTINGS_TREE,
  findVisibleLeaf,
  firstVisibleHref,
  searchSettings,
  visibleLeaves,
  visibleTree,
} from './sections'

const ADMIN = [
  PERMISOS.EMPRESAS_WRITE,
  PERMISOS.CATALOGOS_WRITE,
  PERMISOS.ROLES_WRITE,
  PERMISOS.USUARIOS_WRITE,
]
const SOLO_USUARIOS = [PERMISOS.USUARIOS_WRITE]

const ids = (permisos: string[]) => visibleLeaves(permisos).map(({ leaf }) => leaf.id)

describe('visibleTree / visibleLeaves', () => {
  it('con todos los permisos ve todos los ajustes, en el orden del menú', () => {
    expect(ids(ADMIN)).toEqual([
      'profile',
      'general',
      'appearance',
      'positions',
      'tardiness-types',
      'stages',
      'criteria',
    ])
  })

  it('sin EMPRESAS_WRITE no ve Datos de la empresa ni General', () => {
    expect(ids([PERMISOS.CATALOGOS_WRITE])).not.toContain('profile')
    expect(ids([PERMISOS.CATALOGOS_WRITE])).not.toContain('general')
  })

  it('sin CATALOGOS_WRITE el módulo Reclutamiento desaparece entero (no queda vacío)', () => {
    const tree = visibleTree(SOLO_USUARIOS)
    expect(tree.modules.map((mod) => mod.id)).toEqual(['employees', 'attendance'])
  })

  it('arma la ruta legible: Empresa sin prefijo, módulos con el nombre del módulo', () => {
    const paths = Object.fromEntries(visibleLeaves(ADMIN).map(({ leaf, path }) => [leaf.id, path]))
    expect(paths.general).toBe('General')
    expect(paths.positions).toBe('Empleados / Puestos')
    expect(paths['tardiness-types']).toBe('Asistencia / Tipos de tardía')
  })

  it('cada href vive bajo /settings y cada hoja de módulo bajo su módulo', () => {
    for (const leaf of SETTINGS_TREE.company) {
      expect(leaf.href).toBe(`/settings/${leaf.id}`)
    }
    for (const mod of SETTINGS_TREE.modules) {
      for (const leaf of mod.children) {
        expect(leaf.href).toBe(`/settings/${mod.id}/${leaf.id}`)
      }
    }
  })
})

describe('firstVisibleHref', () => {
  it('sin módulo: el primer ajuste visible (Datos de la empresa para un admin)', () => {
    expect(firstVisibleHref(ADMIN)).toBe('/settings/profile')
  })

  it('sin EMPRESAS_WRITE arranca en Apariencia', () => {
    expect(firstVisibleHref(SOLO_USUARIOS)).toBe('/settings/appearance')
  })

  it('con módulo: su primer ajuste visible', () => {
    expect(firstVisibleHref(ADMIN, 'recruitment')).toBe('/settings/recruitment/stages')
  })

  it('un módulo sin ajustes visibles devuelve null', () => {
    expect(firstVisibleHref(SOLO_USUARIOS, 'recruitment')).toBeNull()
  })

  it('/settings siempre tiene destino: Apariencia es visible para todos', () => {
    expect(firstVisibleHref([])).toBe('/settings/appearance')
  })
})

describe('findVisibleLeaf', () => {
  it('devuelve la hoja con su ruta cuando el usuario la ve', () => {
    expect(findVisibleLeaf('positions', ADMIN)?.path).toBe('Empleados / Puestos')
  })

  it('devuelve null cuando no la ve (URL escrita a mano)', () => {
    expect(findVisibleLeaf('stages', SOLO_USUARIOS)).toBeNull()
  })

  it('devuelve null para un id que no existe', () => {
    expect(findVisibleLeaf('nada', ADMIN)).toBeNull()
  })
})

describe('searchSettings', () => {
  const found = (query: string, permisos = ADMIN) =>
    searchSettings(query, permisos).map(({ leaf }) => leaf.id)

  it('sin consulta devuelve todos los visibles', () => {
    expect(found('  ')).toEqual(ids(ADMIN))
  })

  it('ignora mayúsculas y tildes', () => {
    expect(found('TARDIA')).toEqual(['tardiness-types'])
  })

  it('encuentra por palabra clave', () => {
    expect(found('cargo')).toEqual(['positions'])
    expect(found('am pm')).toEqual(['general'])
  })

  it('encuentra por el nombre del módulo', () => {
    expect(found('reclutamiento')).toEqual(['stages', 'criteria'])
  })

  it('todas las palabras tienen que aparecer', () => {
    expect(found('etapas embudo')).toEqual(['stages'])
    expect(found('etapas cargo')).toEqual([])
  })

  it('no devuelve ajustes que el usuario no ve', () => {
    expect(found('etapas', SOLO_USUARIOS)).toEqual([])
  })
})
