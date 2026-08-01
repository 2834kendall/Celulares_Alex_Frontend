'use client'

import { classifyScore, scoreTint } from '@/modules/evaluations/lib/scoring'

interface ScoreCellProps {
  score: number | undefined
  label: string
}

// Celda de la tabla general: el fondo toma el color del nivel de desempeno
// para que la fila completa se lea de un vistazo.
export function ScoreCell({ score, label }: ScoreCellProps) {
  if (score === undefined) {
    return <td className="px-3 py-2 text-center text-slate-300">—</td>
  }

  const value = Math.round(score)

  return (
    <td
      title={`${label}: ${value}/10 · ${classifyScore(value).label}`}
      style={{ backgroundColor: scoreTint(value) }}
      className="px-3 py-2 text-center text-xs font-semibold tabular-nums text-slate-800"
    >
      {value}
    </td>
  )
}
