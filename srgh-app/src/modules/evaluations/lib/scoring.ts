import type { EvaluationNotes } from '@/modules/evaluations/types'

export const LOW_PERFORMANCE_THRESHOLD = 7

export function averageScore(scores: number[]): number | null {
  if (scores.length === 0) return null
  const sum = scores.reduce((acc, s) => acc + s, 0)
  return Math.round(sum / scores.length)
}

export interface Classification {
  label: string
  tone: 'emerald' | 'blue' | 'amber' | 'orange' | 'rose'
}

export function classifyScore(promedio: number): Classification {
  if (promedio >= 9) return { label: 'Sobresaliente (A)', tone: 'emerald' }
  if (promedio >= 8) return { label: 'Muy Bueno (B)', tone: 'blue' }
  if (promedio >= 7) return { label: 'Bueno (C)', tone: 'amber' }
  if (promedio >= 6) return { label: 'Regular (D)', tone: 'orange' }
  return { label: 'Deficiente (E)', tone: 'rose' }
}

const TINT_ALPHA = 0.13

export function scoreTint(score: number): string {
  const channels = parseInt(scoreColor(score).slice(1), 16)
  const r = (channels >> 16) & 255
  const g = (channels >> 8) & 255
  const b = channels & 255
  return `rgba(${r}, ${g}, ${b}, ${TINT_ALPHA})`
}

export function scoreColor(score: number): string {
  if (score >= 10) return '#22c55e' // green-500
  if (score >= 9) return '#16a34a' // green-600
  if (score >= 8) return '#15803d' // green-700
  if (score >= 7) return '#eab308' // yellow-500
  if (score >= 6) return '#f97316' // orange-500
  if (score >= 4) return '#ef4444' // red-500
  return '#dc2626' // red-600
}

const EMPTY_NOTES: EvaluationNotes = { fortalezas: [], mejoras: [], comentarios: '' }

export function serializeNotes(notes: EvaluationNotes): string {
  return JSON.stringify({
    fortalezas: notes.fortalezas.map((f) => f.trim()).filter(Boolean),
    mejoras: notes.mejoras.map((m) => m.trim()).filter(Boolean),
    comentarios: notes.comentarios.trim(),
  })
}

export function parseNotes(raw: string | null): EvaluationNotes {
  if (!raw) return EMPTY_NOTES
  try {
    const parsed = JSON.parse(raw) as Partial<EvaluationNotes>
    return {
      fortalezas: Array.isArray(parsed.fortalezas) ? parsed.fortalezas.map(String) : [],
      mejoras: Array.isArray(parsed.mejoras) ? parsed.mejoras.map(String) : [],
      comentarios: typeof parsed.comentarios === 'string' ? parsed.comentarios : '',
    }
  } catch {
    return { ...EMPTY_NOTES, comentarios: raw }
  }
}

export function formatPeriod(inicio: string, fin: string): string {
  return `${inicio} a ${fin}`
}

export function initialsOf(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')
}
