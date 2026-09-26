import { describe, expect, it } from 'vitest'
import { camposFotoAsistencia, marcasCambiaron, mismasHoras, origenHoras } from './horasOrigen'

const AHORA = '2026-07-16 09:30:00'
const SIN_FOTO = { horas: null, horasExtra: null }

describe('mismasHoras', () => {
  it('ignora el ruido de coma flotante', () => {
    expect(mismasHoras(0.1 + 0.2, 0.3)).toBe(true)
    expect(mismasHoras(88, 88.001)).toBe(true)
  })

  it('no ignora una diferencia real', () => {
    expect(mismasHoras(88, 88.5)).toBe(false)
    expect(mismasHoras(88, 90)).toBe(false)
  })
})

describe('origenHoras', () => {
  it('las horas vienen de las marcas cuando coinciden con la foto', () => {
    expect(origenHoras({ horas: 84, horasExtra: 3 }, { horas: 84, horasExtra: 3 })).toBe(
      'asistencia'
    )
  })

  it('detecta que alguien las corrigió', () => {
    expect(origenHoras({ horas: 90, horasExtra: 3 }, { horas: 84, horasExtra: 3 })).toBe(
      'ajustadas'
    )
    // También si lo que cambió son solo las extra.
    expect(origenHoras({ horas: 84, horasExtra: 8 }, { horas: 84, horasExtra: 3 })).toBe(
      'ajustadas'
    )
  })

  // Sin foto no se puede afirmar nada. Antes de esta distinción, una fila sin
  // referencia se habría reportado como "corregida a mano" por alguien que
  // nunca la tocó.
  it('sin foto dice que no hay referencia, no que se ajustó', () => {
    expect(origenHoras({ horas: 88, horasExtra: 0 }, { horas: null, horasExtra: null })).toBe(
      'sin_referencia'
    )
    expect(origenHoras({ horas: 88, horasExtra: 0 }, { horas: 84, horasExtra: null })).toBe(
      'sin_referencia'
    )
  })

  // Una columna que la consulta no trajo llega como undefined, no como null.
  it('trata undefined igual que null', () => {
    const foto = {} as { horas: number | null; horasExtra: number | null }
    expect(origenHoras({ horas: 88, horasExtra: 0 }, foto)).toBe('sin_referencia')
  })
})

describe('marcasCambiaron', () => {
  it('avisa cuando la asistencia dice algo distinto de la foto', () => {
    expect(marcasCambiaron({ horas: 84, horasExtra: 3 }, { horas: 88, horasExtra: 3 })).toBe(true)
    expect(marcasCambiaron({ horas: 84, horasExtra: 3 }, { horas: 84, horasExtra: 0 })).toBe(true)
  })

  it('no avisa si sigue diciendo lo mismo', () => {
    expect(marcasCambiaron({ horas: 84, horasExtra: 3 }, { horas: 84, horasExtra: 3 })).toBe(false)
  })

  it('sin foto no inventa una diferencia contra cero', () => {
    expect(marcasCambiaron({ horas: null, horasExtra: null }, { horas: 84, horasExtra: 3 })).toBe(
      false
    )
  })
})

describe('camposFotoAsistencia', () => {
  it('guarda la foto y no marca ajuste cuando se respeta la asistencia', () => {
    const campos = camposFotoAsistencia({
      lectura: { estado: 'ok', datos: { horas: 84, horasExtra: 3 } },
      guardadasPrevias: null,
      fotoPrevia: SIN_FOTO,
      guardadas: { horas: 84, horasExtra: 3 },
      usuarioId: 7,
      ahora: AHORA,
    })

    expect(campos).toEqual({
      escribir: true,
      campos: {
        ndt_horas_asistencia: 84,
        ndt_horas_extra_asistencia: 3,
        ndt_horas_leidas_en: AHORA,
        ndt_horas_ajustadas_por_id: null,
        ndt_horas_ajustadas_en: null,
      },
    })
  })

  // Es el caso que pidió el negocio: el Excel puede corregir las horas, pero
  // tiene que quedar registro de quién y cuándo.
  it('registra quién corrigió las horas y contra qué', () => {
    const campos = camposFotoAsistencia({
      lectura: { estado: 'ok', datos: { horas: 84, horasExtra: 3 } },
      guardadasPrevias: null,
      fotoPrevia: SIN_FOTO,
      guardadas: { horas: 90, horasExtra: 3 },
      usuarioId: 7,
      ahora: AHORA,
    })

    expect(campos).toEqual({
      escribir: true,
      campos: {
        // La foto guarda lo que decían las marcas, no lo que se pagó.
        ndt_horas_asistencia: 84,
        ndt_horas_extra_asistencia: 3,
        ndt_horas_leidas_en: AHORA,
        ndt_horas_ajustadas_por_id: 7,
        ndt_horas_ajustadas_en: AHORA,
      },
    })
  })

  it('registra el ajuste aunque no se sepa el usuario', () => {
    const campos = camposFotoAsistencia({
      lectura: { estado: 'ok', datos: { horas: 84, horasExtra: 3 } },
      guardadasPrevias: null,
      fotoPrevia: SIN_FOTO,
      guardadas: { horas: 90, horasExtra: 3 },
      usuarioId: null,
      ahora: AHORA,
    })

    expect(campos.escribir && campos.campos.ndt_horas_ajustadas_en).toBe(AHORA)
    expect(campos.escribir && campos.campos.ndt_horas_ajustadas_por_id).toBeNull()
  })

  // Es la trampa que abría el bloqueo de "las marcas cambiaron": volver a
  // guardar el mismo dato viejo (re-subir el Excel, o guardar el detalle sin
  // tocarlo) hacía que el sistema lo tomara como una corrección deliberada,
  // apagaba el aviso y pagaba el monto viejo — atribuyéndole la corrección a
  // quien solo siguió las instrucciones del mensaje de error.
  it('no toma por corrección volver a guardar lo mismo que decía la foto vieja', () => {
    const campos = camposFotoAsistencia({
      // Las marcas ahora dicen 88 h.
      lectura: { estado: 'ok', datos: { horas: 88, horasExtra: 0 } },
      // Pero lo que llega es lo mismo que ya estaba guardado: 80 h.
      guardadas: { horas: 80, horasExtra: 0 },
      guardadasPrevias: { horas: 80, horasExtra: 0 },
      fotoPrevia: { horas: 80, horasExtra: 0 },
      usuarioId: 7,
      ahora: AHORA,
    })

    // No escribir = no se tocan las columnas: la fila sigue desactualizada y
    // bloqueada.
    expect(campos).toEqual({ escribir: false, motivo: 'horas_sin_cambiar' })
  })

  it('sí acepta la corrección cuando las horas que llegan son otras', () => {
    const campos = camposFotoAsistencia({
      lectura: { estado: 'ok', datos: { horas: 88, horasExtra: 0 } },
      guardadas: { horas: 88, horasExtra: 0 },
      guardadasPrevias: { horas: 80, horasExtra: 0 },
      fotoPrevia: { horas: 80, horasExtra: 0 },
      usuarioId: 7,
      ahora: AHORA,
    })

    expect(campos).toEqual({
      escribir: true,
      campos: {
        ndt_horas_asistencia: 88,
        ndt_horas_extra_asistencia: 0,
        ndt_horas_leidas_en: AHORA,
        ndt_horas_ajustadas_por_id: null,
        ndt_horas_ajustadas_en: null,
      },
    })
  })

  // El guard NO puede dispararse cuando alguien decidió algo, aunque el número
  // que puso coincida con la foto vieja. Es lo que se me habia escapado: la
  // fila pagaba 100 h, las marcas cambiaron a 90, el encargado puso 84 (que es
  // lo que decia la foto vieja) y su decision no quedaba registrada.
  it('registra la corrección aunque el número nuevo coincida con la foto vieja', () => {
    const campos = camposFotoAsistencia({
      lectura: { estado: 'ok', datos: { horas: 90, horasExtra: 0 } },
      guardadas: { horas: 84, horasExtra: 0 },
      guardadasPrevias: { horas: 100, horasExtra: 0 },
      fotoPrevia: { horas: 84, horasExtra: 0 },
      usuarioId: 9,
      ahora: AHORA,
    })

    expect(campos).toEqual({
      escribir: true,
      campos: {
        ndt_horas_asistencia: 90,
        ndt_horas_extra_asistencia: 0,
        ndt_horas_leidas_en: AHORA,
        ndt_horas_ajustadas_por_id: 9,
        ndt_horas_ajustadas_en: AHORA,
      },
    })
  })

  // Un periodo sin fechas no tiene marcas que leer. Guardar una foto vieja de
  // otro guardado diría algo que ya no es cierto.
  it('limpia la foto cuando no hay asistencia que leer', () => {
    const campos = camposFotoAsistencia({
      lectura: { estado: 'sin_fechas' },
      guardadasPrevias: null,
      fotoPrevia: SIN_FOTO,
      guardadas: { horas: 88, horasExtra: 0 },
      usuarioId: 7,
      ahora: AHORA,
    })

    expect(campos).toEqual({
      escribir: true,
      campos: {
        ndt_horas_asistencia: null,
        ndt_horas_extra_asistencia: null,
        ndt_horas_leidas_en: null,
        ndt_horas_ajustadas_por_id: null,
        ndt_horas_ajustadas_en: null,
      },
    })
  })
})
