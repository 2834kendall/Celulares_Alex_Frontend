'use client'

import { classifyScore, scoreColor } from '@/modules/evaluations/lib/scoring'
import { cn } from '@/lib/utils/cn'

interface ScoreRingProps {
  /** Promedio 0-10, o null si todavía no hay ningún criterio calificado. */
  score: number | null
  /** Criterios con número (sin contar los N/A). */
  scored: number
  /** Criterios marcados como "No aplica". */
  notApplicable: number
  total: number
  /**
   * Versión en línea (anillo chico + clasificación) para el resumen de la
   * sección plegable de la ficha, que se ve aunque esté cerrada.
   */
  compact?: boolean
}

// Mismo tono que las pastillas de evaluaciones (classifyScore → BadgeTone),
// en versión texto para la etiqueta de al lado del anillo.
const TONE_TEXT = {
  emerald: 'text-emerald-700',
  blue: 'text-blue-700',
  amber: 'text-amber-700',
  orange: 'text-orange-700',
  rose: 'text-rose-700',
} as const

function Ring({ score, size, stroke }: { score: number | null; size: number; stroke: number }) {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const fraction = score === null ? 0 : Math.min(1, Math.max(0, score / 10))

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={stroke}
        className="stroke-slate-200"
      />
      {score !== null && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke={scoreColor(score)}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          // Se llena (o vacía) al cambiar un puntaje: responde al toque en
          // la escala sin tener que buscar el número.
          className="transition-[stroke-dashoffset,stroke] duration-500 ease-out motion-reduce:transition-none"
        />
      )}
    </svg>
  )
}

/**
 * Resumen del puntaje de una postulación: anillo que se llena según el
 * promedio (color de `scoreColor`, el mismo de evaluaciones y de la escala
 * 0-10), clasificación y avance de la calificación.
 *
 * Antes era una pastilla chica "Promedio: 9/10" en la esquina: para el dato
 * con el que RRHH compara candidatos, pasaba desapercibida.
 */
export function ScoreRing({
  score,
  scored,
  notApplicable,
  total,
  compact = false,
}: ScoreRingProps) {
  const hasScore = score !== null
  const classification = hasScore ? classifyScore(score) : null
  const missing = total - scored - notApplicable
  const label = hasScore
    ? `Promedio ${score} de 10, ${classification!.label}`
    : 'Todavía sin puntaje'

  if (compact) {
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        {/* Decorativo: el número y la clasificación ya van escritos al lado. */}
        <span className="relative shrink-0" aria-hidden="true">
          <Ring score={score} size={26} stroke={4} />
        </span>
        <span className="truncate">
          {hasScore ? (
            <>
              <span className="font-bold tabular-nums text-slate-900">{score}/10</span>{' '}
              <span className={cn('font-semibold', TONE_TEXT[classification!.tone])}>
                {classification!.label}
              </span>
            </>
          ) : (
            'Sin calificar'
          )}
        </span>
      </span>
    )
  }

  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
      <div className="relative h-16 w-16 shrink-0" role="img" aria-label={label}>
        <Ring score={score} size={64} stroke={6} />
        <div className="absolute inset-0 flex items-baseline justify-center pt-[18px]">
          <span className="text-xl font-bold leading-none tabular-nums text-slate-900">
            {hasScore ? score : '—'}
          </span>
          {hasScore && <span className="ml-px text-[10px] font-semibold text-slate-500">/10</span>}
        </div>
      </div>

      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-700">Puntaje del candidato</p>
        <p
          className={cn(
            'mt-0.5 text-sm font-bold',
            classification ? TONE_TEXT[classification.tone] : 'text-slate-500'
          )}
        >
          {classification ? classification.label : 'Sin calificar'}
        </p>
        <p className="mt-0.5 text-[11px] text-slate-500">
          {scored} de {total} calificados
          {notApplicable > 0 && ` · ${notApplicable} N/A`}
          {missing > 0 && ` · faltan ${missing}`}
        </p>
      </div>
    </div>
  )
}
