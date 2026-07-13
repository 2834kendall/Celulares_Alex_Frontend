import type { EvaluationNotes } from '@/modules/evaluations/types'

/** Umbral bajo el cual un colaborador se considera de bajo rendimiento. */
export const LOW_PERFORMANCE_THRESHOLD = 7

/** Promedio simple redondeado a 1 decimal; null cuando no hay notas. */
export function averageScore(scores: number[]): number | null {
  if (scores.length === 0) return null
  const sum = scores.reduce((acc, s) => acc + s, 0)
  return Math.round((sum / scores.length) * 10) / 10
}

export interface Classification {
  label: string
  /** Tonalidad tailwind usada por los badges del modulo. */
  tone: 'emerald' | 'blue' | 'amber' | 'orange' | 'rose'
}

/** Escala cualitativa mostrada junto al promedio (A-E). */
export function classifyScore(promedio: number): Classification {
  if (promedio >= 9) return { label: 'Sobresaliente (A)', tone: 'emerald' }
  if (promedio >= 8) return { label: 'Muy Bueno (B)', tone: 'blue' }
  if (promedio >= 7) return { label: 'Bueno (C)', tone: 'amber' }
  if (promedio >= 6) return { label: 'Regular (D)', tone: 'orange' }
  return { label: 'Deficiente (E)', tone: 'rose' }
}

/**
 * Color de la barra segun la nota. Escala de un solo tono (mas azul = mejor
 * nota) para que las barras convivan sin chocar; solo el bajo rendimiento
 * rompe la paleta para llamar la atencion.
 */
export function scoreBarColor(score: number): string {
  if (score >= 9) return 'bg-blue-600'
  if (score >= 8) return 'bg-blue-500'
  if (score >= 7) return 'bg-blue-300'
  return 'bg-rose-400'
}

const EMPTY_NOTES: EvaluationNotes = { fortalezas: [], mejoras: [], comentarios: '' }

/**
 * Las notas cualitativas (puntos fuertes, aspectos a mejorar y comentarios)
 * viajan juntas en eve_observaciones como JSON, porque la tabla solo ofrece
 * un campo de texto libre.
 */
export function serializeNotes(notes: EvaluationNotes): string {
  return JSON.stringify({
    fortalezas: notes.fortalezas.map((f) => f.trim()).filter(Boolean),
    mejoras: notes.mejoras.map((m) => m.trim()).filter(Boolean),
    comentarios: notes.comentarios.trim(),
  })
}

/** Contraparte de serializeNotes: texto plano legado se trata como comentario. */
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

/** Rango del periodo evaluado como se guarda en eve_tipo_periodo. */
export function formatPeriod(inicio: string, fin: string): string {
  return `${inicio} a ${fin}`
}

/** Iniciales para el avatar (max 2 letras). */
export function initialsOf(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')
}
