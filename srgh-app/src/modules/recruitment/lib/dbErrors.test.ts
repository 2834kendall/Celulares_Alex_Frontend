import { describe, expect, it } from 'vitest'
import { mapRecruitmentUniqueError } from './dbErrors'

describe('mapRecruitmentUniqueError', () => {
  it('devuelve null si el error no es de unicidad', () => {
    expect(mapRecruitmentUniqueError({ code: '23503', message: 'fk violation' })).toBeNull()
    expect(mapRecruitmentUniqueError(null)).toBeNull()
    expect(mapRecruitmentUniqueError(undefined)).toBeNull()
  })

  it('reconoce la violación del UNIQUE de identificación', () => {
    expect(
      mapRecruitmentUniqueError({
        code: '23505',
        message: 'duplicate key value violates unique constraint "sgrh_cdt_identificacion_unica"',
      })
    ).toBe('Ya existe un candidato registrado con ese tipo y número de identificación.')
  })

  it('cae a un mensaje genérico para otras violaciones de unicidad', () => {
    expect(mapRecruitmentUniqueError({ code: '23505', message: 'otra_columna_unica' })).toBe(
      'Ya existe un candidato con alguno de los datos que deben ser únicos.'
    )
  })
})
