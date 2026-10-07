import { describe, expect, it } from 'vitest'
import { mapContractError, mapEmployeeUniqueError } from './dbErrors'

describe('mapEmployeeUniqueError', () => {
  it('devuelve null si no es una violación de unicidad', () => {
    expect(mapEmployeeUniqueError(null)).toBeNull()
    expect(mapEmployeeUniqueError(undefined)).toBeNull()
    expect(mapEmployeeUniqueError({ code: '23503', message: 'fk violation' })).toBeNull()
  })

  it('identifica la columna de identificación', () => {
    expect(
      mapEmployeeUniqueError({
        code: '23505',
        message:
          'duplicate key value violates unique constraint "sgrh_empleados_emp_numero_identificacion_key"',
      })
    ).toBe('Ya existe un empleado con ese número de identificación.')
  })

  it('identifica la columna de correo personal', () => {
    expect(
      mapEmployeeUniqueError({
        code: '23505',
        details: 'Key (emp_email_personal)=(ana@mail.com) already exists.',
      })
    ).toBe('Ya existe un empleado con ese correo personal.')
  })

  it('identifica la columna de asegurado CCSS', () => {
    expect(
      mapEmployeeUniqueError({
        code: '23505',
        details: 'Key (emp_numero_asegurado_ccss)=(123) already exists.',
      })
    ).toBe('Ya existe un empleado con ese número de asegurado CCSS.')
  })

  it('cae a un mensaje genérico de unicidad si no reconoce la columna', () => {
    expect(mapEmployeeUniqueError({ code: '23505' })).toBe(
      'Ya existe un empleado con alguno de los datos que deben ser únicos (identificación, correo personal o nº de asegurado CCSS).'
    )
  })
})

describe('mapContractError', () => {
  const GENERICO = 'No se pudo guardar el contrato.'

  it.each(['23514', '23503', '42501'])(
    'con %s muestra el mensaje de la RPC tal cual (ya viene escrito para la UI)',
    (code) => {
      expect(
        mapContractError({ code, message: 'Este contrato ya pasó por planilla.' }, GENERICO)
      ).toBe('Este contrato ya pasó por planilla.')
    }
  )

  it('con 23505 (el índice de un solo contrato vigente) no muestra el nombre del índice', () => {
    expect(
      mapContractError(
        {
          code: '23505',
          message:
            'duplicate key value violates unique constraint "ux_historial_un_contrato_vigente"',
        },
        GENERICO
      )
    ).toBe('Este empleado ya tiene un contrato vigente.')
  })

  it('cualquier otro código cae al mensaje genérico', () => {
    expect(mapContractError({ code: '08006', message: 'connection failure' }, GENERICO)).toBe(
      GENERICO
    )
  })

  it('sin mensaje de la RPC cae al genérico', () => {
    expect(mapContractError({ code: '23514' }, GENERICO)).toBe(GENERICO)
  })
})
