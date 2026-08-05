'use client'

import { useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  CalendarDays,
  ClipboardCheck,
  Lightbulb,
  MessageSquareQuote,
  Plus,
  Sparkles,
  Star,
  UserRound,
} from 'lucide-react'
import type { CollaboratorRow, RubroRow } from '@/modules/evaluations/types'
import { classifyScore, initialsOf } from '@/modules/evaluations/lib/scoring'
import { usePagination } from '@/modules/evaluations/hooks/usePagination'
import { Pagination } from '@/components/ui/Pagination'
import { CollaboratorSearchSelect } from './CollaboratorSearchSelect'
import { EditNotesModal, type NotesField } from './EditNotesModal'
import { EvaluationHistory } from './EvaluationHistory'
import { ScoreBar } from './ScoreBar'

interface IndividualViewProps {
  collaborators: CollaboratorRow[]
  rubros: RubroRow[]
  canWrite: boolean
}

const BADGE_TONES: Record<string, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  blue: 'bg-blue-50 text-blue-700 ring-blue-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  orange: 'bg-orange-50 text-orange-700 ring-orange-200',
  rose: 'bg-rose-50 text-rose-700 ring-rose-200',
}

interface AddNoteButtonProps {
  label: string
  onClick: () => void
}

//CTA que convierte una seccion de notas vacia en editable.
function AddNoteButton({ label, onClick }: AddNoteButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-blue-600 outline-none transition hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-500/60"
    >
      <Plus className="h-3 w-3" /> {label}
    </button>
  )
}

export function IndividualView({ collaborators, rubros, canWrite }: IndividualViewProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [editingField, setEditingField] = useState<NotesField | null>(null)

  const rubrosPagination = usePagination(rubros, 8)

  const paramLabId = Number(searchParams.get('colaborador'))
  const selected = useMemo(
    () => collaborators.find((c) => c.labId === paramLabId) ?? collaborators[0] ?? null,
    [collaborators, paramLabId]
  )

  function selectCollaborator(labId: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', 'individual')
    params.set('colaborador', String(labId))
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  function goToNewEvaluation(labId: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', 'nueva')
    params.set('colaborador', String(labId))
    router.push(`${pathname}?${params.toString()}`)
  }

  if (!selected) {
    return (
      <div className="flex flex-col items-center gap-2.5 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-10 text-center">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm ring-1 ring-slate-200">
          <UserRound className="h-4 w-4" />
        </div>
        <p className="text-sm font-semibold text-slate-700">No hay colaboradores activos</p>
        <p className="max-w-sm text-xs text-slate-500">
          Cuando existan colaboradores en la planilla podrá consultar aquí su expediente de
          desempeño.
        </p>
      </div>
    )
  }

  const evaluation = selected.evaluation
  const classification = evaluation?.promedio != null ? classifyScore(evaluation.promedio) : null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-slate-900">
            Expediente de desempeño personalizado
          </h2>
          <p className="text-xs text-slate-500">
            Consulte por separado las fortalezas, comentarios e índices de cada trabajador.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs font-medium text-slate-500">
          Colaborador:
          <CollaboratorSearchSelect
            collaborators={collaborators}
            selectedLabId={selected.labId}
            onSelect={selectCollaborator}
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[18rem_1fr]">
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,.04)]">
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-lg font-bold text-blue-700 ring-4 ring-blue-100/60">
              {initialsOf(selected.fullName)}
            </span>
            <div>
              <p className="text-sm font-bold text-slate-900">{selected.fullName}</p>
              <p className="text-xs font-medium text-slate-500">
                {selected.position ?? 'Sin puesto asignado'}
              </p>
              <p className="text-[11px] text-slate-400">{selected.branchName}</p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Promedio total
            </p>
            <p className="mt-0.5 text-lg font-bold tabular-nums text-blue-700">
              {evaluation?.promedio != null ? `${Math.round(evaluation.promedio)}/10` : '—'}
            </p>
            {classification && (
              <span
                className={`mt-1 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase ring-1 ${BADGE_TONES[classification.tone]}`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {classification.label}
              </span>
            )}
          </div>

          <dl className="space-y-1.5 text-xs">
            <div className="flex justify-between gap-2">
              <dt className="font-semibold text-slate-500">Evaluador:</dt>
              <dd className="truncate text-right text-slate-700">{evaluation?.evaluador ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="font-semibold text-slate-500">Tipo:</dt>
              <dd className="truncate text-right text-slate-700">{evaluation?.tipo ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="font-semibold text-slate-500">Fecha eval:</dt>
              <dd className="tabular-nums text-slate-700">{evaluation?.fecha ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="font-semibold text-slate-500">Período:</dt>
              <dd className="truncate text-right text-slate-700">{evaluation?.periodo ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="font-semibold text-slate-500">Evaluaciones:</dt>
              <dd className="tabular-nums text-slate-700">{selected.history.length}</dd>
            </div>
          </dl>
        </div>

        {evaluation ? (
          <div className="min-w-0 space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,.04)]">
              <h3 className="flex items-center gap-2 px-4 pt-4 text-xs font-bold uppercase tracking-wide text-slate-900">
                <ClipboardCheck className="h-3.5 w-3.5 text-blue-600" />
                Criterios de evaluación interna
              </h3>
              <div className="space-y-4 p-4">
                {rubrosPagination.paginatedItems.map((r) => {
                  const observation =
                    r.criterioId !== null ? evaluation.observations[r.criterioId] : undefined
                  return (
                    <div key={r.areaId}>
                      <ScoreBar
                        label={r.nombre}
                        score={
                          r.criterioId !== null && evaluation.scores[r.criterioId] !== undefined
                            ? evaluation.scores[r.criterioId]
                            : null
                        }
                      />
                      {observation && (
                        <p className="mt-1 text-[11px] italic leading-4 text-slate-400">
                          {observation}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
              <Pagination
                page={rubrosPagination.page}
                totalPages={rubrosPagination.totalPages}
                onPrevious={rubrosPagination.goToPreviousPage}
                onNext={rubrosPagination.goToNextPage}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                <h4 className="flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                  <Sparkles className="h-3.5 w-3.5" /> Puntos fuertes detectados
                </h4>
                {evaluation.notes.fortalezas.length > 0 ? (
                  <ul className="mt-2 space-y-1.5">
                    {evaluation.notes.fortalezas.map((f, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-emerald-900">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                        {f}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <>
                    <p className="mt-2 text-xs text-emerald-900/60">
                      No se registraron puntos fuertes en esta evaluación.
                    </p>
                    {canWrite && (
                      <AddNoteButton
                        label="Agregar puntos fuertes"
                        onClick={() => setEditingField('fortalezas')}
                      />
                    )}
                  </>
                )}
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                <h4 className="flex items-center gap-1.5 text-xs font-bold text-amber-800">
                  <Lightbulb className="h-3.5 w-3.5" /> Aspectos a mejorar
                </h4>
                {evaluation.notes.mejoras.length > 0 ? (
                  <ul className="mt-2 space-y-1.5">
                    {evaluation.notes.mejoras.map((m, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-amber-900">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                        {m}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <>
                    <p className="mt-2 text-xs text-amber-900/60">
                      No se registraron aspectos a mejorar en esta evaluación.
                    </p>
                    {canWrite && (
                      <AddNoteButton
                        label="Agregar aspectos a mejorar"
                        onClick={() => setEditingField('mejoras')}
                      />
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,.04)]">
              <h4 className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                <MessageSquareQuote className="h-3.5 w-3.5 text-blue-600" /> Comentarios de
                liderazgo
              </h4>
              {evaluation.notes.comentarios ? (
                <p className="mt-2 text-xs italic leading-5 text-slate-600">
                  &ldquo;{evaluation.notes.comentarios}&rdquo;
                </p>
              ) : (
                <>
                  <p className="mt-2 text-xs text-slate-400">
                    Sin comentarios registrados para este período.
                  </p>
                  {canWrite && (
                    <AddNoteButton
                      label="Agregar comentarios"
                      onClick={() => setEditingField('comentarios')}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2.5 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-12 text-center">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm ring-1 ring-slate-200">
              <CalendarDays className="h-4 w-4" />
            </div>
            <p className="text-sm font-semibold text-slate-700">
              Este colaborador aún no tiene evaluaciones
            </p>
            <p className="max-w-sm text-xs text-slate-500">
              Registre su primera evaluación de desempeño desde la pestaña “Nueva evaluación” o en
              el botón inferior para ver aquí sus criterios, fortalezas y aspectos a mejorar.
            </p>
            {canWrite && (
              <button
                type="button"
                onClick={() => goToNewEvaluation(selected.labId)}
                className="mt-1 flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm outline-none transition hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 active:scale-[0.98]"
              >
                <Star className="h-3.5 w-3.5" /> Realizar evaluación a {selected.fullName}
              </button>
            )}
          </div>
        )}
      </div>

      <EvaluationHistory collaborator={selected} rubros={rubros} />

      {editingField && evaluation && (
        <EditNotesModal
          evaluationId={evaluation.id}
          field={editingField}
          notes={evaluation.notes}
          onClose={() => setEditingField(null)}
        />
      )}
    </div>
  )
}
