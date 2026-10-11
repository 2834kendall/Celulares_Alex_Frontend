import { describe, expect, it } from 'vitest'
import { PERMISOS } from './catalog'
import { ZONAS, zonasVisibles, visibleNavSections } from './zones'

const EMPLEADO_LIKE = [
  PERMISOS.ASISTENCIA_WRITE,
  PERMISOS.AUSENCIAS_WRITE,
  PERMISOS.COMPROBANTES_READ,
]

describe('visibleNavSections', () => {
  it('sin permisos solo queda la seccion sin grupo con Inicio', () => {
    const sections = visibleNavSections([])
    expect(sections).toHaveLength(1)
    expect(sections[0].group).toBeNull()
    expect(sections[0].zonas.map((z) => z.key)).toEqual(['dashboard'])
  })

  it('con todos los permisos aparecen los tres grupos, en orden', () => {
    const sections = visibleNavSections(Object.values(PERMISOS))
    expect(sections.map((s) => s.group?.id ?? null)).toEqual([
      null,
      'people',
      'operations',
      'administration',
    ])
  })

  it('el menu agrupado conserva el orden de ZONAS (ninguna zona fuera de su grupo)', () => {
    const sections = visibleNavSections(Object.values(PERMISOS))
    expect(sections.flatMap((s) => s.zonas)).toEqual(ZONAS)
  })

  it('perfil EMPLEADO: sin Personal, con Operación y Administración', () => {
    const sections = visibleNavSections(EMPLEADO_LIKE)
    expect(sections.map((s) => s.group?.label ?? null)).toEqual([
      null,
      'Operación',
      'Administración',
    ])
  })

  it('solo reclutamiento: Inicio y el grupo Personal', () => {
    const sections = visibleNavSections([PERMISOS.RECLUTAMIENTO_READ])
    expect(sections.map((s) => s.group?.id ?? null)).toEqual([null, 'people'])
    expect(sections[1].zonas.map((z) => z.key)).toEqual(['recruitment'])
  })

  it('Inicio no tiene grupo ni pide permisos (la seccion sin grupo nunca queda vacia)', () => {
    const inicio = ZONAS.find((z) => z.key === 'dashboard')
    expect(inicio?.group).toBeNull()
    expect(inicio?.permisos).toEqual([])
  })
})

describe('zonasVisibles', () => {
  it('sin permisos solo Inicio es visible', () => {
    const zonas = zonasVisibles([])
    expect(zonas.map((z) => z.key)).toEqual(['dashboard'])
  })

  it('con todos los permisos todas las zonas son visibles', () => {
    const zonas = zonasVisibles(Object.values(PERMISOS))
    expect(zonas).toHaveLength(ZONAS.length)
  })

  it('perfil EMPLEADO ve Inicio, Asistencia y Nómina', () => {
    const zonas = zonasVisibles(EMPLEADO_LIKE)
    expect(zonas.map((z) => z.key)).toEqual(['dashboard', 'attendance', 'payroll'])
  })
})
