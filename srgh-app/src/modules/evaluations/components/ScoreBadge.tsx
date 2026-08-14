'use client'

import { Badge } from '@/components/ui/Badge'
import { classifyScore } from '@/modules/evaluations/lib/scoring'

interface ScoreBadgeProps {
  score: number | null
}

/**
 * Pastilla con el promedio 0-10 coloreada segun la escala cualitativa.
 *
 * El tono sale de `classifyScore`, cuyo tipo de retorno es un subconjunto de
 * `BadgeTone`: la paleta ya no se repite aca.
 */
export function ScoreBadge({ score }: ScoreBadgeProps) {
  if (score === null) {
    return <Badge tone="slate">Sin evaluar</Badge>
  }

  return (
    <Badge tone={classifyScore(score).tone} className="tabular-nums">
      {Math.round(score)}/10
    </Badge>
  )
}
