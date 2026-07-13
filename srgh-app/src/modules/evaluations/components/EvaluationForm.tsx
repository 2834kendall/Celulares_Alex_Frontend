'use client'

import { useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { AlertTriangle, Loader2, Star } from 'lucide-react'
import type { CollaboratorRow, RubroRow } from '@/modules/evaluations/types'
import { evaluationSchema, EVALUATION_TYPES } from '@/modules/evaluations/types'
import { averageScore, classifyScore } from '@/modules/evaluations/lib/scoring'
import { createEvaluation } from '@/modules/evaluations/actions/createEvaluation'
import { NotesListInput } from './NotesListInput'

interface EvaluationFormProps {
  collaborators: CollaboratorRow[]
  rubros: RubroRow[]
  /** Colaborador preseleccionado (deep-link desde la vista individual). */
  initialLabId?: number
  onSuccess?: () => void
}

const INPUT_CLASSES =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-600/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400'

const LABEL_CLASSES = 'mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500'

interface ScoreEntry {
  puntaje: number
  observacion: string
  noAplica: boolean
}

export function EvaluationForm({
  collaborators,
  rubros,
  initialLabId,
  onSuccess,
}: EvaluationFormProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const scorableRubros = rubros.filter((r) => r.criterioId !== null)

  const [labId, setLabId] = useState<number | ''>(
    initialLabId && collaborators.some((c) => c.labId === initialLabId) ? initialLabId : ''
  )
  const [tipo, setTipo] = useState<(typeof EVALUATION_TYPES)[number]>('Mensual')
  const [periodoInicio, setPeriodoInicio] = useState('')
  const [periodoFin, setPeriodoFin] = useState('')
  const [scores, setScores] = useState<Record<number, ScoreEntry>>(() =>
    Object.fromEntries(
      scorableRubros.map((r) => [r.criterioId!, { puntaje: 7, observacion: '', noAplica: false }])
    )
  )
  const [fortalezas, setFortalezas] = useState<string[]>([])
  const [mejoras, setMejoras] = useState<string[]>([])
  const [comentarios, setComentarios] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const applicable = Object.values(scores).filter((s) => !s.noAplica)
  const promedio = averageScore(applicable.map((s) => s.puntaje))

  function patchScore(criterioId: number, patch: Partial<ScoreEntry>) {
    setScores((prev) => ({ ...prev, [criterioId]: { ...prev[criterioId], ...patch } }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const parsed = evaluationSchema.safeParse({
      labId: labId === '' ? undefined : labId,
      tipo,
      periodoInicio,
      periodoFin,
      scores: Object.entries(scores).map(([criterioId, s]) => ({
        criterioId: Number(criterioId),
        puntaje: s.noAplica ? null : s.puntaje,
        observacion: s.observacion,
        noAplica: s.noAplica,
      })),
      fortalezas,
      mejoras,
      comentarios,
    })

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Revise los datos del formulario.')
      return
    }

    setIsSubmitting(true)
    const result = await createEvaluation(parsed.data)
    setIsSubmitting(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    onSuccess?.()
    // Lleva al expediente recien evaluado para ver el resultado.
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', 'individual')
    params.set('colaborador', String(parsed.data.labId))
    router.push(`${pathname}?${params.toString()}`)
  }

  if (scorableRubros.length === 0) {
    return (
      <div
        role="alert"
        className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"
      >
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
        <p>
          No hay rubros de evaluación definidos. Cree al menos uno en “Gestionar rubros” antes de
          evaluar a un colaborador.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />
          <div>{error}</div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <label className={LABEL_CLASSES} htmlFor="eval_colaborador">
            Colaborador
          </label>
          <select
            id="eval_colaborador"
            value={labId}
            disabled={isSubmitting}
            onChange={(e) => setLabId(e.target.value === '' ? '' : Number(e.target.value))}
            className={INPUT_CLASSES}
          >
            <option value="">Seleccione un colaborador...</option>
            {collaborators.map((c) => (
              <option key={c.labId} value={c.labId}>
                {c.fullName} — {c.branchName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL_CLASSES} htmlFor="eval_tipo">
            Tipo de evaluación
          </label>
          <select
            id="eval_tipo"
            value={tipo}
            disabled={isSubmitting}
            onChange={(e) => setTipo(e.target.value as (typeof EVALUATION_TYPES)[number])}
            className={INPUT_CLASSES}
          >
            {EVALUATION_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL_CLASSES} htmlFor="eval_periodo_inicio">
            Período evaluado — desde
          </label>
          <input
            id="eval_periodo_inicio"
            type="date"
            value={periodoInicio}
            disabled={isSubmitting}
            max={periodoFin || undefined}
            onChange={(e) => setPeriodoInicio(e.target.value)}
            className={`${INPUT_CLASSES} tabular-nums`}
          />
        </div>
        <div>
          <label className={LABEL_CLASSES} htmlFor="eval_periodo_fin">
            Período evaluado — hasta
          </label>
          <input
            id="eval_periodo_fin"
            type="date"
            value={periodoFin}
            disabled={isSubmitting}
            min={periodoInicio || undefined}
            onChange={(e) => setPeriodoFin(e.target.value)}
            className={`${INPUT_CLASSES} tabular-nums`}
          />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-600">
            Calificación por rubro
          </p>
          {promedio !== null && (
            <p className="text-[11px] font-semibold text-slate-500">
              Promedio:{' '}
              <span className="font-bold tabular-nums text-blue-700">{promedio.toFixed(1)}/10</span>{' '}
              · {classifyScore(promedio).label}
            </p>
          )}
        </div>
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 lg:grid-cols-2">
          {scorableRubros.map((r) => {
            const entry = scores[r.criterioId!]
            return (
              <div
                key={r.criterioId}
                className={`rounded-lg p-2 transition ${entry.noAplica ? 'opacity-60' : ''}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <label
                    htmlFor={`score-${r.criterioId}`}
                    className="min-w-0 truncate text-xs font-semibold text-slate-800"
                    title={r.descripcion}
                  >
                    {r.nombre}
                  </label>
                  <span className="shrink-0 text-xs font-bold tabular-nums text-slate-900">
                    {entry.noAplica ? 'N/A' : `${entry.puntaje}/10`}
                  </span>
                </div>
                <input
                  id={`score-${r.criterioId}`}
                  type="range"
                  min={0}
                  max={10}
                  step={0.5}
                  value={entry.puntaje}
                  disabled={isSubmitting || entry.noAplica}
                  onChange={(e) => patchScore(r.criterioId!, { puntaje: Number(e.target.value) })}
                  className="mt-1 w-full accent-blue-600 disabled:opacity-40"
                />
                <div className="mt-1.5 flex items-center gap-2">
                  <input
                    value={entry.observacion}
                    disabled={isSubmitting || entry.noAplica}
                    onChange={(e) => patchScore(r.criterioId!, { observacion: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] text-slate-700 shadow-sm transition placeholder:text-slate-300 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/10 disabled:cursor-not-allowed disabled:bg-slate-50"
                    placeholder="Observaciones (opcional)"
                  />
                  <label className="flex shrink-0 cursor-pointer items-center gap-1 text-[11px] font-medium text-slate-500">
                    <input
                      type="checkbox"
                      checked={entry.noAplica}
                      disabled={isSubmitting}
                      onChange={(e) => patchScore(r.criterioId!, { noAplica: e.target.checked })}
                      className="h-3.5 w-3.5 rounded border-slate-300 accent-blue-600"
                    />
                    No aplica
                  </label>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <NotesListInput
          label="Puntos fuertes"
          placeholder="Ej: Compromiso con las guardias"
          items={fortalezas}
          disabled={isSubmitting}
          onChange={setFortalezas}
        />
        <NotesListInput
          label="Aspectos a mejorar"
          placeholder="Ej: Orden"
          items={mejoras}
          disabled={isSubmitting}
          onChange={setMejoras}
        />
      </div>

      <div>
        <label className={LABEL_CLASSES} htmlFor="eval_comentarios">
          Comentarios de liderazgo
        </label>
        <textarea
          id="eval_comentarios"
          rows={3}
          value={comentarios}
          disabled={isSubmitting}
          onChange={(e) => setComentarios(e.target.value)}
          className={`${INPUT_CLASSES} resize-none`}
          placeholder="Observaciones generales sobre la proyección del colaborador..."
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm outline-none transition-all hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Registrando evaluación
          </>
        ) : (
          <>
            <Star className="h-3.5 w-3.5" /> Guardar evaluación
          </>
        )}
      </button>
    </form>
  )
}
