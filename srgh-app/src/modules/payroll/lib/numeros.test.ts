import { describe, expect, it } from 'vitest'
import { round2 } from './numeros'

describe('round2', () => {
  it('redondea a dos decimales', () => {
    expect(round2(1234.5678)).toBe(1234.57)
    expect(round2(10)).toBe(10)
    expect(round2(0.1 + 0.2)).toBe(0.3)
  })

  /*
   * El caso que motivo unificar las tres copias que habia en el modulo: la
   * version de `incapacidad` no sumaba `Number.EPSILON` y las de `planilla` y
   * `bancoHoras` si. Con montos chicos eso daba resultados DISTINTOS para el
   * mismo numero, o sea un centimo de diferencia segun por que calculo de
   * nomina pasara. Se dejo la version con EPSILON, que es la que usaba
   * `planilla` (el calculo principal).
   */
  it('redondea hacia arriba en el caso clasico de 1.005', () => {
    // Sin `Number.EPSILON` esto da 1.00: 1.005 * 100 es 100.49999999999999.
    expect(round2(1.005)).toBe(1.01)
  })

  /*
   * OJO — el truco de EPSILON NO es una solucion general al punto flotante:
   * `Number.EPSILON` es la resolucion cerca de 1.0, asi que para magnitudes
   * mayores ya no alcanza para empujar el valor por encima del punto medio.
   * Se documenta con un test para que nadie asuma que redondea "bien" siempre
   * y construya sobre esa idea; para montos grandes con medio centimo exacto
   * habria que ir a decimales enteros (trabajar en centimos), que es un
   * cambio de modelo de datos, no de esta funcion.
   */
  it('no corrige el medio centimo en magnitudes altas (limite conocido)', () => {
    // 8.075 es en realidad 8.074999999999999289... y EPSILON no lo alcanza.
    expect(round2(8.075)).toBe(8.07)
  })

  it('respeta el signo de los montos negativos (deducciones)', () => {
    expect(round2(-1234.5678)).toBe(-1234.57)
  })
})
