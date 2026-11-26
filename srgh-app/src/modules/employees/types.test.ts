import { describe, expect, it } from 'vitest'
import {
  crearEmpleadoSchema,
  crearHistorialLaboralSchema,
  datosPagoSchema,
  editarEmpleadoSchema,
  onboardingEmpleadoSchema,
  puestoSchema,
} from '@/modules/employees/types'
import { shiftISODate, todayInCostaRica } from '@/modules/attendance/lib/time'

/**
 * Normalización del número de cuenta.
 *
 * No es cosmética: el índice ciego (edp_cuenta_hmac) se calcula sobre la salida
 * de este preprocess. HMAC es determinístico y por lo tanto sensible a cada
 * carácter, así que si el mismo número entrara con distinto formato daría
 * índices distintos y la detección de cuentas repetidas dejaría de encontrarlas.
 *
 * El punto delicado es SINPE: el preprocess normaliza cualquier string sin
 * mirar edp_tipo_cuenta, y de eso depende que '8888 8888' y '88888888' cuenten
 * como la misma cuenta. Un cambio que restrinja la normalización solo al IBAN
 * rompería la detección justo en el dominio más chico (10⁸ combinaciones), que
 * es donde más importa. Estos tests existen para que ese cambio no pase callado.
 */
describe('datosPagoSchema — normalización del número de cuenta', () => {
  it('normaliza el IBAN: mayúsculas y sin separadores', () => {
    const parsed = datosPagoSchema.parse({
      edp_banco_id: 3,
      edp_tipo_cuenta: 'AHORRO',
      edp_numero_cuenta: ' cr02 0102-0000 0000 0000 01 ',
    })

    expect(parsed.edp_numero_cuenta).toBe('CR02010200000000000001')
  })

  it('normaliza también el SINPE, aunque no sea un IBAN', () => {
    const parsed = datosPagoSchema.parse({
      edp_banco_id: 3,
      edp_tipo_cuenta: 'SINPE',
      edp_numero_cuenta: '8888 7777',
    })

    expect(parsed.edp_numero_cuenta).toBe('88887777')
  })

  it('el mismo número escrito de dos formas produce un solo valor', () => {
    const base = { edp_banco_id: 3, edp_tipo_cuenta: 'SINPE' as const }

    const conEspacio = datosPagoSchema.parse({ ...base, edp_numero_cuenta: '8888 7777' })
    const sinEspacio = datosPagoSchema.parse({ ...base, edp_numero_cuenta: '88887777' })

    // Si esto deja de cumplirse, dos empleados con la misma cuenta dejan de
    // detectarse como duplicados.
    expect(conEspacio.edp_numero_cuenta).toBe(sinEspacio.edp_numero_cuenta)
  })

  it('convierte una cuenta vacía en null, no en cadena vacía', () => {
    const parsed = datosPagoSchema.parse({ edp_banco_id: 3, edp_numero_cuenta: '   ' })

    // El constraint edp_cuenta_hmac_pareado compara contra NULL: una cadena
    // vacía dejaría la cuenta "presente" y el índice nulo.
    expect(parsed.edp_numero_cuenta).toBeNull()
  })
})

const EMPLEADO_ALTA = {
  emp_nombre: 'Ana',
  emp_apellido_1: 'Mora',
  emp_tipo_identificacion_id: 1,
  emp_numero_identificacion: '1-1111-1111',
  emp_fecha_ingreso_original: '2026-09-01',
  emp_fecha_nacimiento: '1990-05-10',
  emp_genero: 'F',
}

function mensajes(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.success ? [] : result.error!.issues.map((i) => i.message)
}

describe('crearEmpleadoSchema — fecha de nacimiento y género', () => {
  it('en el alta son obligatorios', () => {
    const result = crearEmpleadoSchema.safeParse({
      ...EMPLEADO_ALTA,
      emp_fecha_nacimiento: '',
      emp_genero: '',
    })

    expect(mensajes(result)).toEqual(
      expect.arrayContaining(['La fecha de nacimiento es obligatoria', 'El género es obligatorio'])
    )
  })

  // Hay fichas anteriores sin estos datos: exigirlos al editar bloquearía
  // cualquier otro cambio sobre ellas.
  it('en la edición siguen siendo opcionales (vacío → null)', () => {
    const result = editarEmpleadoSchema.safeParse({
      emp_telefono: '8888-8888',
      emp_fecha_nacimiento: '',
      emp_genero: '',
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.emp_fecha_nacimiento).toBeNull()
    expect(result.data.emp_genero).toBeNull()
  })

  it('rechaza fechas de nacimiento futuras en el alta y en la edición', () => {
    const manana = shiftISODate(todayInCostaRica(), 1)

    const alta = crearEmpleadoSchema.safeParse({
      ...EMPLEADO_ALTA,
      emp_fecha_nacimiento: manana,
    })
    expect(mensajes(alta)).toContain('La fecha de nacimiento no puede ser futura')

    const edicion = editarEmpleadoSchema.safeParse({
      emp_fecha_nacimiento: manana,
    })
    expect(mensajes(edicion)).toContain('La fecha de nacimiento no puede ser futura')

    expect(
      crearEmpleadoSchema.safeParse({
        ...EMPLEADO_ALTA,
        emp_fecha_nacimiento: todayInCostaRica(),
      }).success
    ).toBe(true)
  })

  it('rechaza fechas inexistentes en el calendario (p. ej. 2026-02-30)', () => {
    const alta = crearEmpleadoSchema.safeParse({
      ...EMPLEADO_ALTA,
      emp_fecha_nacimiento: '2026-02-30',
    })
    expect(mensajes(alta)).toEqual(['Fecha de nacimiento inválida'])

    const edicion = editarEmpleadoSchema.safeParse({
      emp_fecha_nacimiento: '2026-02-30',
    })
    expect(mensajes(edicion)).toEqual(['Fecha de nacimiento inválida'])
  })

  it('recorta espacios en el número de identificación y rechaza solo espacios', () => {
    const ok = crearEmpleadoSchema.parse({
      ...EMPLEADO_ALTA,
      emp_numero_identificacion: '  1-1111-1111  ',
    })
    expect(ok.emp_numero_identificacion).toBe('1-1111-1111')

    const vacio = crearEmpleadoSchema.safeParse({
      ...EMPLEADO_ALTA,
      emp_numero_identificacion: '   ',
    })
    expect(mensajes(vacio)).toContain('El número de identificación es obligatorio')
  })
})

describe('crearHistorialLaboralSchema — salarios con decimales y validación positiva', () => {
  const CONTRATO_BASE = {
    lab_puesto_id: 3,
    lab_sucursal_id: 2,
    lab_tipo_contrato_id: 1,
    lab_tipo_jornada_id: 1,
    lab_fecha_inicio: '2026-09-01',
    lab_salario_base: 500000,
    lab_salario_real: 500000,
  }

  it('acepta salarios enteros y con hasta 2 decimales', () => {
    expect(
      crearHistorialLaboralSchema.safeParse({
        ...CONTRATO_BASE,
        lab_salario_base: 1234.56,
        lab_salario_real: 19.99,
      }).success
    ).toBe(true)
  })

  it('rechaza 0 y montos negativos', () => {
    const cero = crearHistorialLaboralSchema.safeParse({
      ...CONTRATO_BASE,
      lab_salario_base: 0,
      lab_salario_real: -500,
    })
    expect(mensajes(cero)).toEqual(
      expect.arrayContaining([
        'El salario base debe ser mayor a 0',
        'El salario real debe ser mayor a 0',
      ])
    )
  })

  it('rechaza montos con más de 2 decimales sin redondear ni multiplicar', () => {
    const tresDecimales = crearHistorialLaboralSchema.safeParse({
      ...CONTRATO_BASE,
      lab_salario_base: 350000.555,
      lab_salario_real: 350000.555,
    })
    expect(mensajes(tresDecimales)).toEqual([
      'El salario puede tener hasta 2 decimales',
      'El salario puede tener hasta 2 decimales',
    ])
  })
})

describe('puestoSchema — salario mínimo de referencia', () => {
  it('rechaza cero o negativos con acentuación correcta', () => {
    const result = puestoSchema.safeParse({
      pue_nombre: 'Cajero',
      pue_salario_minimo_referencia: '0',
    })
    expect(mensajes(result)).toContain('Debe ser un número positivo.')
  })
})

describe('onboardingEmpleadoSchema — inicio del contrato', () => {
  const ALTA = {
    empleado: EMPLEADO_ALTA,
    direccion: { dir_distrito_id: 121, dir_senas_exactas: '200 m norte de la iglesia' },
    contratacion: {
      lab_puesto_id: 3,
      lab_sucursal_id: 2,
      lab_tipo_contrato_id: 1,
      lab_tipo_jornada_id: 1,
      lab_fecha_inicio: '2026-09-01',
      lab_salario_base: 500000,
      lab_salario_real: 500000,
    },
  }

  it('acepta un contrato que empieza el mismo día del ingreso', () => {
    expect(onboardingEmpleadoSchema.safeParse(ALTA).success).toBe(true)
  })

  it('rechaza un contrato que empieza antes del ingreso a la empresa', () => {
    const result = onboardingEmpleadoSchema.safeParse({
      ...ALTA,
      contratacion: { ...ALTA.contratacion, lab_fecha_inicio: '2026-08-31' },
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.issues).toContainEqual(
      expect.objectContaining({
        path: ['contratacion', 'lab_fecha_inicio'],
        message: 'El contrato no puede empezar antes del ingreso a la empresa',
      })
    )
  })
})
