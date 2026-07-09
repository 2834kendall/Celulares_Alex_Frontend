import { describe, expect, it } from 'vitest'
import { PERMISOS } from './catalog'
import { ZONAS, zonasVisibles, tituloDeRuta } from './zones'

describe('zonasVisibles', () => {
  it('sin permisos solo Inicio es visible', () => {
    const zonas = zonasVisibles([])
    expect(zonas.map((z) => z.key)).toEqual(['dashboard'])
  })

  it('con todos los permisos todas las zonas son visibles', () => {
    const zonas = zonasVisibles(Object.values(PERMISOS))
    expect(zonas).toHaveLength(ZONAS.length)
  })

  it('perfil EMPLEADO ve Inicio, Asistencia y Nomina', () => {
    const zonas = zonasVisibles([
      PERMISOS.ASISTENCIA_WRITE,
      PERMISOS.AUSENCIAS_WRITE,
      PERMISOS.COMPROBANTES_READ,
    ])
    expect(zonas.map((z) => z.key)).toEqual(['dashboard', 'attendance', 'payroll'])
  })
})

describe('tituloDeRuta', () => {
  it('resuelve el titulo por coincidencia exacta', () => {
    expect(tituloDeRuta('/employees')).toBe('Empleados')
  })

  it('resuelve el titulo en subrutas', () => {
    expect(tituloDeRuta('/employees/123')).toBe('Empleados')
  })

  it('devuelve el nombre del sistema para rutas desconocidas', () => {
    expect(tituloDeRuta('/otra-cosa')).toBe('SGRH')
  })

  it('resuelve titulos de rutas fuera del sidebar', () => {
    expect(tituloDeRuta('/profile')).toBe('Mi perfil')
    expect(tituloDeRuta('/profile/editar')).toBe('Mi perfil')
  })
})
