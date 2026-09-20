import { describe, expect, it } from 'vitest'
import {
  allowedNextMarks,
  isExitWindowOpen,
  describeSequenceRejection,
  groupIntoDayJourney,
  isLunchWindowOpen,
  type RawMark,
} from './marks'

function mark(id: number, tipo: RawMark['tipo'], hora: string): RawMark {
  return { id, tipo, fechaHora: `2026-07-25 ${hora}` }
}

function allowedAfter(...marks: RawMark[]) {
  return allowedNextMarks(groupIntoDayJourney(marks))
}

describe('groupIntoDayJourney con receso', () => {
  it('ubica las marcas del receso en su lugar', () => {
    const journey = groupIntoDayJourney([
      mark(1, 'entrada', '08:00:00'),
      mark(2, 'inicio_receso', '10:00:00'),
      mark(3, 'fin_receso', '10:10:00'),
    ])

    expect(journey.inicioReceso?.id).toBe(2)
    expect(journey.finReceso?.id).toBe(3)
  })
})

describe('allowedNextMarks', () => {
  it('sin marcas solo se puede entrar', () => {
    expect(allowedAfter()).toEqual(['entrada'])
  })

  it('despues de entrar: receso, almuerzo o salida', () => {
    expect(allowedAfter(mark(1, 'entrada', '08:00:00'))).toEqual([
      'inicio_receso',
      'inicio_almuerzo',
      'salida',
    ])
  })

  it('con el receso abierto solo se puede cerrar el receso', () => {
    expect(
      allowedAfter(mark(1, 'entrada', '08:00:00'), mark(2, 'inicio_receso', '10:00:00'))
    ).toEqual(['fin_receso'])
  })

  it('con el almuerzo abierto solo se puede cerrar el almuerzo, ni siquiera salir', () => {
    expect(
      allowedAfter(mark(1, 'entrada', '08:00:00'), mark(2, 'inicio_almuerzo', '12:00:00'))
    ).toEqual(['fin_almuerzo'])
  })

  it('cada periodo se toma una sola vez al dia', () => {
    expect(
      allowedAfter(
        mark(1, 'entrada', '08:00:00'),
        mark(2, 'inicio_receso', '10:00:00'),
        mark(3, 'fin_receso', '10:10:00'),
        mark(4, 'inicio_almuerzo', '12:00:00'),
        mark(5, 'fin_almuerzo', '13:00:00')
      )
    ).toEqual(['salida'])
  })

  it('el receso puede ir despues del almuerzo', () => {
    expect(
      allowedAfter(
        mark(1, 'entrada', '08:00:00'),
        mark(2, 'inicio_almuerzo', '12:00:00'),
        mark(3, 'fin_almuerzo', '13:00:00')
      )
    ).toEqual(['inicio_receso', 'salida'])
  })

  it('no exige haber almorzado para salir', () => {
    // Que pasa si no se toma el almuerzo esta fuera de alcance (decision del
    // cliente): bloquear la salida obligaria a inventar marcas.
    expect(allowedAfter(mark(1, 'entrada', '08:00:00'))).toContain('salida')
  })

  it('despues de la salida no queda nada que marcar', () => {
    expect(allowedAfter(mark(1, 'entrada', '08:00:00'), mark(2, 'salida', '17:00:00'))).toEqual([])
  })
})

describe('describeSequenceRejection', () => {
  it('explica que marcas corresponden', () => {
    expect(describeSequenceRejection('salida', ['fin_almuerzo'])).toBe(
      'No corresponde marcar salida ahora. Puedes marcar: fin de almuerzo.'
    )
  })

  it('despues de la salida lo dice directo', () => {
    expect(describeSequenceRejection('entrada', [])).toBe('Ya registraste tu salida de hoy.')
  })

  describe('la ventana del almuerzo', () => {
    it('esta abierta dentro de la media hora previa o posterior', () => {
      expect(isLunchWindowOpen('12:00', '12:00')).toBe(true)
      expect(isLunchWindowOpen('11:30', '12:00')).toBe(true)
      expect(isLunchWindowOpen('12:30', '12:00')).toBe(true)
    })

    it('esta cerrada fuera de esa media hora', () => {
      expect(isLunchWindowOpen('11:29', '12:00')).toBe(false)
      expect(isLunchWindowOpen('12:31', '12:00')).toBe(false)
      expect(isLunchWindowOpen('08:05', '12:00')).toBe(false)
    })

    it('sin almuerzo programado no hay hora que respetar', () => {
      expect(isLunchWindowOpen('08:05', null)).toBe(true)
    })

    it('fuera de la ventana el kiosco no ofrece empezar el almuerzo', () => {
      const jornada = groupIntoDayJourney([mark(1, 'entrada', '08:00')])

      expect(allowedNextMarks(jornada, { lunchWindowOpen: false })).toEqual([
        'inicio_receso',
        'salida',
      ])
      expect(allowedNextMarks(jornada, { lunchWindowOpen: true })).toEqual([
        'inicio_receso',
        'inicio_almuerzo',
        'salida',
      ])
    })

    it('el almuerzo abierto se puede cerrar aunque la ventana ya paso', () => {
      const jornada = groupIntoDayJourney([
        mark(1, 'entrada', '08:00'),
        mark(2, 'inicio_almuerzo', '12:00'),
      ])

      expect(allowedNextMarks(jornada, { lunchWindowOpen: false })).toEqual(['fin_almuerzo'])
    })
  })

  describe('la ventana de la salida', () => {
    it('se abre quince minutos antes de la hora de salida', () => {
      expect(isExitWindowOpen('16:45', '17:00')).toBe(true)
      expect(isExitWindowOpen('17:00', '17:00')).toBe(true)
      // Quedarse de mas no impide cerrar la jornada.
      expect(isExitWindowOpen('19:30', '17:00')).toBe(true)
    })

    it('esta cerrada antes de eso', () => {
      expect(isExitWindowOpen('16:44', '17:00')).toBe(false)
      expect(isExitWindowOpen('10:00', '17:00')).toBe(false)
    })

    it('sin hora de salida programada no hay nada que respetar', () => {
      expect(isExitWindowOpen('10:00', null)).toBe(true)
    })

    it('antes de su hora el kiosco no ofrece la salida', () => {
      const jornada = groupIntoDayJourney([mark(1, 'entrada', '08:00')])

      expect(allowedNextMarks(jornada, { exitWindowOpen: false })).toEqual([
        'inicio_receso',
        'inicio_almuerzo',
      ])
    })
  })

  describe('horarios sin receso', () => {
    it('no ofrecen marcar receso', () => {
      const jornada = groupIntoDayJourney([mark(1, 'entrada', '08:00')])

      expect(allowedNextMarks(jornada, { breakScheduled: false })).toEqual([
        'inicio_almuerzo',
        'salida',
      ])
    })

    it('un receso ya abierto se puede cerrar igual', () => {
      const jornada = groupIntoDayJourney([
        mark(1, 'entrada', '08:00'),
        mark(2, 'inicio_receso', '10:00'),
      ])

      expect(allowedNextMarks(jornada, { breakScheduled: false })).toEqual(['fin_receso'])
    })
  })
})
