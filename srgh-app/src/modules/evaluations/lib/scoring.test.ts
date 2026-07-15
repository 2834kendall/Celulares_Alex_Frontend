import { describe, expect, it } from 'vitest'
import {
  averageScore,
  classifyScore,
  formatPeriod,
  initialsOf,
  parseNotes,
  scoreColor,
  serializeNotes,
} from './scoring'

describe('averageScore', () => {
  it('devuelve null sin notas', () => {
    expect(averageScore([])).toBeNull()
  })

  it('promedia y redondea a 1 decimal', () => {
    expect(averageScore([10, 9, 9.2, 9, 8])).toBe(9)
    expect(averageScore([8, 7])).toBe(7.5)
    expect(averageScore([7, 7, 8])).toBe(7.3)
  })
})

describe('classifyScore', () => {
  it('clasifica segun la escala A-E', () => {
    expect(classifyScore(9.5).label).toBe('Sobresaliente (A)')
    expect(classifyScore(9).label).toBe('Sobresaliente (A)')
    expect(classifyScore(8.2).label).toBe('Muy Bueno (B)')
    expect(classifyScore(7).label).toBe('Bueno (C)')
    expect(classifyScore(6.5).label).toBe('Regular (D)')
    expect(classifyScore(3).label).toBe('Deficiente (E)')
  })
})

describe('scoreColor', () => {
  it('colorea segun la nota con la escala tipo semaforo', () => {
    expect(scoreColor(10)).toBe('#22c55e')
    expect(scoreColor(9.5)).toBe('#16a34a')
    expect(scoreColor(8)).toBe('#15803d')
    expect(scoreColor(7)).toBe('#eab308')
    expect(scoreColor(6.5)).toBe('#f97316')
    expect(scoreColor(5)).toBe('#ef4444')
    expect(scoreColor(2)).toBe('#dc2626')
  })
})

describe('serializeNotes / parseNotes', () => {
  it('serializa y parsea las notas en ida y vuelta', () => {
    const raw = serializeNotes({
      fortalezas: [' Compromiso ', ''],
      mejoras: ['Orden'],
      comentarios: ' Buen desempeño ',
    })

    expect(parseNotes(raw)).toEqual({
      fortalezas: ['Compromiso'],
      mejoras: ['Orden'],
      comentarios: 'Buen desempeño',
    })
  })

  it('devuelve notas vacias con null', () => {
    expect(parseNotes(null)).toEqual({ fortalezas: [], mejoras: [], comentarios: '' })
  })

  it('trata texto plano legado como comentario', () => {
    expect(parseNotes('Colaborador ejemplar')).toEqual({
      fortalezas: [],
      mejoras: [],
      comentarios: 'Colaborador ejemplar',
    })
  })

  it('tolera JSON con formas inesperadas', () => {
    expect(parseNotes('{"fortalezas":"no-array","comentarios":5}')).toEqual({
      fortalezas: [],
      mejoras: [],
      comentarios: '',
    })
  })
})

describe('formatPeriod', () => {
  it('une el rango de fechas evaluado', () => {
    expect(formatPeriod('2026-06-01', '2026-06-30')).toBe('2026-06-01 a 2026-06-30')
  })
})

describe('initialsOf', () => {
  it('toma las iniciales de los dos primeros nombres', () => {
    expect(initialsOf('Carlos Madrigal Chaves')).toBe('CM')
    expect(initialsOf('valeria')).toBe('V')
  })
})
