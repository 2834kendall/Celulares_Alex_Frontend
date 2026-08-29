import { describe, expect, it } from 'vitest'
import { datosPagoSchema } from '@/modules/employees/types'

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
