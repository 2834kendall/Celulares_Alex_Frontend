import { describe, expect, it } from 'vitest'
import { PERMISOS } from './catalog'

/**
 * El catalogo debe reflejar EXACTAMENTE los permisos sembrados en Supabase
 * (tabla sgrh_cat_permisos). Si este test falla, alguien agrego/quito un
 * permiso en un solo lado — sincronizar ambos.
 */
const PERMISOS_EN_SUPABASE = [
  'EMPLEADOS_READ',
  'EMPLEADOS_WRITE',
  // Sembrados por las migraciones de storage 2026073112/1300 (SGRH-60).
  'FOTOS_READ',
  'DOCUMENTOS_READ',
  'DOCUMENTOS_WRITE',
  'HISTORIAL_READ',
  'HISTORIAL_WRITE',
  'ASISTENCIA_READ',
  'ASISTENCIA_WRITE',
  'AUSENCIAS_READ',
  'AUSENCIAS_WRITE',
  'AUSENCIAS_APPROVE',
  'HORARIOS_READ',
  'HORARIOS_WRITE',
  'NOMINA_READ',
  'NOMINA_WRITE',
  'NOMINA_APPROVE',
  'COMPROBANTES_READ',
  'RECLUTAMIENTO_READ',
  'RECLUTAMIENTO_WRITE',
  'EVALUACIONES_READ',
  'EVALUACIONES_WRITE',
  'EMPRESAS_WRITE',
  'CATALOGOS_WRITE',
  'ROLES_WRITE',
  'USUARIOS_WRITE',
  'REPORTES_READ',
]

describe('catalogo de permisos', () => {
  it('cada clave es identica a su valor (convencion del sistema)', () => {
    for (const [clave, valor] of Object.entries(PERMISOS)) {
      expect(clave).toBe(valor)
    }
  })

  it('refleja exactamente los 27 permisos sembrados en Supabase', () => {
    expect(Object.values(PERMISOS).sort()).toEqual([...PERMISOS_EN_SUPABASE].sort())
  })
})
