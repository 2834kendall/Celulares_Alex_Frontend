'use client'

import { ClipboardCheck, Lightbulb, MessageSquareQuote, Sparkles } from 'lucide-react'
import type { EvaluationDetail, RubroRow } from '@/modules/evaluations/types'
import { Modal } from './Modal'
import { ScoreBadge } from './ScoreBadge'
import { ScoreBar } from './ScoreBar'

interface EvaluationDetailModalProps {
  collaboratorName: string
  detail: EvaluationDetail
  rubros: RubroRow[]
  onClose: () => void
}

/** Pop-up de solo lectura con el detalle completo de una evaluacion del historico. */
export function EvaluationDetailModal({
  collaboratorName,
  detail,
  rubros,
  onClose,
}: EvaluationDetailModalProps) {
  return (
    <Modal
      title={`Evaluación de ${collaboratorName}`}
      subtitle={`${detail.tipo} · ${detail.fecha}${detail.evaluador ? ` · Evaluador: ${detail.evaluador}` : ''}`}
      onClose={onClose}
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Período evaluado
            </p>
            <p className="text-xs font-semibold text-slate-700">{detail.periodo}</p>
          </div>
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Promedio
            </p>
            <ScoreBadge score={detail.promedio} />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 p-3">
          <h4 className="mb-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-700">
            <ClipboardCheck className="h-3.5 w-3.5 text-blue-600" /> Criterios evaluados
          </h4>
          <div className="space-y-3">
            {rubros.map((r) => {
              const score =
                r.criterioId !== null && detail.scores[r.criterioId] !== undefined
                  ? detail.scores[r.criterioId]
                  : null
              const observation =
                r.criterioId !== null ? detail.observations[r.criterioId] : undefined
              return (
                <div key={r.areaId}>
                  <ScoreBar label={r.nombre} score={score} />
                  {observation && (
                    <p className="mt-1 text-[11px] italic leading-4 text-slate-400">
                      {observation}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {detail.notes.fortalezas.length > 0 && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
            <h4 className="flex items-center gap-1.5 text-xs font-bold text-emerald-800">
              <Sparkles className="h-3.5 w-3.5" /> Puntos fuertes detectados
            </h4>
            <ul className="mt-2 space-y-1.5">
              {detail.notes.fortalezas.map((f, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-emerald-900">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        )}

        {detail.notes.mejoras.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
            <h4 className="flex items-center gap-1.5 text-xs font-bold text-amber-800">
              <Lightbulb className="h-3.5 w-3.5" /> Aspectos a mejorar
            </h4>
            <ul className="mt-2 space-y-1.5">
              {detail.notes.mejoras.map((m, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-amber-900">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                  {m}
                </li>
              ))}
            </ul>
          </div>
        )}

        {detail.notes.comentarios && (
          <div className="rounded-xl border border-slate-200 p-3">
            <h4 className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
              <MessageSquareQuote className="h-3.5 w-3.5 text-blue-600" /> Comentarios de liderazgo
            </h4>
            <p className="mt-2 text-xs italic leading-5 text-slate-600">
              &ldquo;{detail.notes.comentarios}&rdquo;
            </p>
          </div>
        )}
      </div>
    </Modal>
  )
}
