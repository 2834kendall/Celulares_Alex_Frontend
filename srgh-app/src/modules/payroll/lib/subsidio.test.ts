import { describe, expect, it } from 'vitest'
import {
  conCuotaObrera,
  diasDeAusenciaEnPeriodo,
  esAusenciaDeSubsidio,
  parametrosDeTipo,
  subsidioCcssEstimado,
  subsidioPatronoEnVivo,
  tipoDeLaFila,
  type AusenciaSubsidio,
  type TipoSubsidioRow,
} from './subsidio'

const QUINCENA = { inicio: '2026-07-01', fin: '2026-07-15' }
const CONTRATO = { salarioBaseMensual: 600000, salarioRealMensual: null }

const TIPO_MAT: TipoSubsidioRow = {
  tau_codigo: 'INC_MAT',
  tau_nombre: 'Incapacidad por Maternidad',
  tau_requiere_documento_ccss: true,
  tau_es_intradia: false,
  tau_paga_empleador_dias: 120,
  tau_porcentaje_pago_empleador: 50,
  tau_porcentaje_cuota_obrera: 10.83,
  tau_porcentaje_subsidio_ccss: 50,
  tau_paga_ccss_desde_dia: 1,
}
const TIPO_ENF: TipoSubsidioRow = {
  tau_codigo: 'INC_ENF',
  tau_nombre: 'Incapacidad por Enfermedad',
  tau_requiere_documento_ccss: true,
  tau_es_intradia: false,
  tau_paga_empleador_dias: 3,
  tau_porcentaje_pago_empleador: 50,
  tau_porcentaje_cuota_obrera: 0,
  tau_porcentaje_subsidio_ccss: 60,
  tau_paga_ccss_desde_dia: 4,
}

const ausencia = (inicio: string, fin: string, tipo: TipoSubsidioRow): AusenciaSubsidio => ({
  inicio,
  fin,
  tipo: parametrosDeTipo(tipo),
})

describe('parametrosDeTipo', () => {
  it('lee los % del tipo', () => {
    expect(parametrosDeTipo(TIPO_MAT)).toEqual({
      codigo: 'INC_MAT',
      nombre: 'Incapacidad por Maternidad',
      pagaPatrono: true,
      porcentajePagoEmpleador: 50,
      porcentajeCuotaObrera: 10.83,
      porcentajeSubsidioCcss: 50,
      ccssDesdeDia: 1,
    })
  })

  it('sin la columna nueva (o con basura) la cuota es 0: lo de antes', () => {
    const p = parametrosDeTipo({ ...TIPO_MAT, tau_porcentaje_cuota_obrera: undefined })
    expect(p.porcentajeCuotaObrera).toBe(0)
    expect(
      parametrosDeTipo({ ...TIPO_MAT, tau_porcentaje_cuota_obrera: -5 }).porcentajeCuotaObrera
    ).toBe(0)
    expect(
      parametrosDeTipo({ ...TIPO_MAT, tau_porcentaje_cuota_obrera: 250 }).porcentajeCuotaObrera
    ).toBe(100)
  })

  it('sin subsidio configurado no hay % de la CCSS', () => {
    const p = parametrosDeTipo({
      ...TIPO_MAT,
      tau_porcentaje_subsidio_ccss: null,
      tau_paga_ccss_desde_dia: null,
    })
    expect(p.porcentajeSubsidioCcss).toBeNull()
    expect(p.ccssDesdeDia).toBeNull()
  })
})

describe('esAusenciaDeSubsidio', () => {
  it('certificada por la CCSS y de día completo', () => {
    expect(esAusenciaDeSubsidio(TIPO_MAT)).toBe(true)
    expect(esAusenciaDeSubsidio({ ...TIPO_MAT, tau_requiere_documento_ccss: false })).toBe(false)
    expect(esAusenciaDeSubsidio({ ...TIPO_MAT, tau_es_intradia: true })).toBe(false)
    expect(esAusenciaDeSubsidio(null)).toBe(false)
  })
})

describe('días', () => {
  it('cuenta solo los días de la ausencia dentro del periodo', () => {
    expect(diasDeAusenciaEnPeriodo({ inicio: '2026-06-20', fin: '2026-10-19' }, QUINCENA)).toBe(15)
    expect(diasDeAusenciaEnPeriodo({ inicio: '2026-07-10', fin: '2026-07-20' }, QUINCENA)).toBe(6)
    expect(diasDeAusenciaEnPeriodo({ inicio: '2026-07-16', fin: '2026-07-20' }, QUINCENA)).toBe(0)
  })
})

describe('tipoDeLaFila', () => {
  it('con una sola ausencia, su tipo', () => {
    expect(tipoDeLaFila([ausencia('2026-06-20', '2026-10-19', TIPO_MAT)], QUINCENA)?.codigo).toBe(
      'INC_MAT'
    )
  })

  it('con dos, la de más días en el periodo; empate: la que empezó primero', () => {
    const enf = ausencia('2026-07-01', '2026-07-03', TIPO_ENF)
    const mat = ausencia('2026-07-04', '2026-10-31', TIPO_MAT)
    expect(tipoDeLaFila([enf, mat], QUINCENA)?.codigo).toBe('INC_MAT')
    const enf2 = ausencia('2026-07-01', '2026-07-03', TIPO_ENF)
    const mat2 = ausencia('2026-07-13', '2026-10-31', TIPO_MAT)
    expect(tipoDeLaFila([mat2, enf2], QUINCENA)?.codigo).toBe('INC_ENF')
  })

  // Revisión: un riesgo del trabajo (tope 0, lo paga el INS) del 01 al 11 y
  // una gripe del 13 al 15. Los 3 días del patrono son de la gripe: elegir el
  // riesgo por tener más días pagaba ₡0.
  it('solo elige entre tipos que el patrono paga', () => {
    const riesgo = ausencia('2026-07-01', '2026-07-11', {
      ...TIPO_ENF,
      tau_codigo: 'INC_RT',
      tau_paga_empleador_dias: 0,
      tau_porcentaje_pago_empleador: 0,
    })
    const gripe = ausencia('2026-07-13', '2026-07-15', { ...TIPO_ENF, tau_paga_empleador_dias: 3 })
    expect(tipoDeLaFila([riesgo, gripe], QUINCENA)?.codigo).toBe('INC_ENF')
    expect(tipoDeLaFila([riesgo], QUINCENA)).toBeNull()
  })

  it('sin ausencias en el periodo, null (se usa el tipo de respaldo)', () => {
    expect(tipoDeLaFila([], QUINCENA)).toBeNull()
    expect(tipoDeLaFila([ausencia('2026-08-01', '2026-08-10', TIPO_MAT)], QUINCENA)).toBeNull()
  })
})

describe('montos', () => {
  it('maternidad: 50 % del patrono menos la cuota obrera configurada', () => {
    // 15 días × 600.000 / 30 × 50 % = 150.000; 10,83 % = 16.245.
    expect(subsidioPatronoEnVivo(15, CONTRATO, parametrosDeTipo(TIPO_MAT))).toEqual({
      montoEmpleador: 150000,
      porcentajeCuotaObrera: 10.83,
      cuotaObrera: 16245,
      neto: 133755,
    })
  })

  it('con cuota 0 el neto es el monto del patrono (como antes)', () => {
    expect(subsidioPatronoEnVivo(3, CONTRATO, parametrosDeTipo(TIPO_ENF))).toEqual({
      montoEmpleador: 30000,
      porcentajeCuotaObrera: 0,
      cuotaObrera: 0,
      neto: 30000,
    })
  })

  it('redondea la cuota a céntimos', () => {
    expect(conCuotaObrera(21500, 10.83)).toEqual({
      montoEmpleador: 21500,
      porcentajeCuotaObrera: 10.83,
      cuotaObrera: 2328.45,
      neto: 19171.55,
    })
  })

  it('maternidad: la CCSS paga todos los días de la licencia, a la par del patrono', () => {
    const mat = ausencia('2026-06-20', '2026-10-19', TIPO_MAT)
    // 15 días × 20.000 × 50 % = 150.000 (la fila no tiene días "de la CCSS")
    expect(subsidioCcssEstimado([mat], QUINCENA, CONTRATO, 0)).toBe(150000)
  })

  it('enfermedad: los días que la fila ya tiene como de la CCSS', () => {
    // Revisión: del 28/10 al 10/11 la quincena del 01 al 15/11 tiene 3 días
    // del patrono (tope mensual) y 7 de la CCSS. Contar desde el día 4 de la
    // ausencia daba 10 días al lado de "Días pagados por la CCSS: 7".
    const nov = { inicio: '2026-11-01', fin: '2026-11-15' }
    const enf = ausencia('2026-10-28', '2026-11-10', TIPO_ENF)
    // 7 × 20.000 × 60 % = 84.000
    expect(subsidioCcssEstimado([enf], nov, CONTRATO, 7)).toBe(84000)
    expect(subsidioCcssEstimado([enf], nov, CONTRATO, 0)).toBeNull()
  })

  it('sin subsidio configurado, o sin días de la CCSS, no hay estimado', () => {
    const sinSubsidio = ausencia('2026-06-20', '2026-10-19', {
      ...TIPO_MAT,
      tau_porcentaje_subsidio_ccss: null,
      tau_paga_ccss_desde_dia: null,
    })
    expect(subsidioCcssEstimado([sinSubsidio], QUINCENA, CONTRATO, 5)).toBeNull()
    const fuera = ausencia('2026-08-01', '2026-08-05', TIPO_MAT)
    expect(subsidioCcssEstimado([fuera], QUINCENA, CONTRATO, 0)).toBeNull()
    expect(subsidioCcssEstimado([], QUINCENA, CONTRATO, 5)).toBeNull()
  })
})
