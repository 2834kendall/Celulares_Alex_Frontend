'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2, ChevronRight, Loader2, Star, XCircle } from 'lucide-react'
import type {
  CriterioSeleccionItem,
  EtapaSeleccionItem,
  PostulacionDetalle,
} from '@/modules/recruitment/types'
import { ESTADO_POSTULACION_LABELS, RESULTADO_ETAPA_LABELS } from '@/modules/recruitment/lib/format'
import { formatDate } from '@/modules/employees/lib/format'
import { advanceStage } from '@/modules/recruitment/actions/advanceStage'
import { rejectPostulacion } from '@/modules/recruitment/actions/rejectPostulacion'
import { savePostulacionScores } from '@/modules/recruitment/actions/savePostulacionScores'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { Modal } from '@/components/ui/Modal'
import { INPUT, LABEL, SELECT, SPINNER } from '@/components/ui/styles'

interface PostulacionPanelProps {
  candidatoId: number
  postulacion: PostulacionDetalle
  etapas: EtapaSeleccionItem[]
  criterios: CriterioSeleccionItem[]
  canWrite: boolean
}

const ESTADO_TONE: Record<string, 'blue' | 'emerald' | 'rose'> = {
  en_proceso: 'blue',
  contratado: 'emerald',
  descartado: 'rose',
}

export function PostulacionPanel({
  candidatoId,
  postulacion,
  etapas,
  criterios,
  canWrite,
}: PostulacionPanelProps) {
  const router = useRouter()
  const enProceso = postulacion.pos_estado_final === 'en_proceso'

  return (
    <div className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,.04)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900">{postulacion.puestoNombre}</p>
          {postulacion.sucursalNombre && (
            <p className="text-xs text-slate-500">{postulacion.sucursalNombre}</p>
          )}
        </div>
        <Badge tone={ESTADO_TONE[postulacion.pos_estado_final] ?? 'blue'}>
          {ESTADO_POSTULACION_LABELS[postulacion.pos_estado_final] ?? postulacion.pos_estado_final}
        </Badge>
      </div>

      <p className="text-[11px] text-slate-400">
        Postuló el {formatDate(postulacion.pos_fecha_postula)}
        {postulacion.pos_fecha_cierre &&
          ` · Cerrada el ${formatDate(postulacion.pos_fecha_cierre)}`}
      </p>

      {postulacion.pos_estado_final === 'contratado' && postulacion.pos_empleado_id && (
        <Link
          href={`/employees/${postulacion.pos_empleado_id}`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"
        >
          Ver ficha del empleado <ChevronRight className="h-3 w-3" />
        </Link>
      )}

      {postulacion.pos_estado_final === 'descartado' && postulacion.pos_motivo_descarte && (
        <Alert tone="warning">
          <div>Motivo: {postulacion.pos_motivo_descarte}</div>
        </Alert>
      )}

      {postulacion.etapas.length > 0 && (
        <div className="space-y-1.5 border-t border-slate-100 pt-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
            Historial de etapas
          </p>
          <ul className="space-y-1.5">
            {postulacion.etapas.map((etapa) => (
              <li key={etapa.pet_id} className="flex items-start gap-2 text-xs">
                <span className="mt-0.5 text-slate-400">{formatDate(etapa.pet_fecha)}</span>
                <span className="min-w-0 flex-1 text-slate-700">
                  <span className="font-semibold">{etapa.etapaNombre}</span>
                  {etapa.pet_resultado && (
                    <>
                      {' — '}
                      {RESULTADO_ETAPA_LABELS[etapa.pet_resultado] ?? etapa.pet_resultado}
                    </>
                  )}
                  {etapa.pet_notas && (
                    <span className="block text-slate-500">{etapa.pet_notas}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {criterios.length > 0 && (
        <ScoreForm
          postulacionId={postulacion.pos_id}
          criterios={criterios}
          existentes={postulacion.puntajes}
          canWrite={canWrite}
        />
      )}

      {canWrite && enProceso && (
        <div className="space-y-2 border-t border-slate-100 pt-3">
          <AdvanceStageForm postulacionId={postulacion.pos_id} etapas={etapas} />
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/recruitment/candidates/${candidatoId}/hire?postulacionId=${postulacion.pos_id}`}
            >
              <Button variant="secondary">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Contratar
              </Button>
            </Link>
            <RejectButton postulacionId={postulacion.pos_id} onDone={() => router.refresh()} />
          </div>
        </div>
      )}
    </div>
  )
}

function AdvanceStageForm({
  postulacionId,
  etapas,
}: {
  postulacionId: number
  etapas: EtapaSeleccionItem[]
}) {
  const router = useRouter()
  const [etapaId, setEtapaId] = useState('')
  const [resultado, setResultado] = useState('pendiente')
  const [notas, setNotas] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!etapaId) {
      setError('Seleccione una etapa.')
      return
    }
    setSubmitting(true)
    setError(null)
    const result = await advanceStage({
      postulacionId,
      etapaId: Number(etapaId),
      resultado: resultado as 'aprobado' | 'rechazado' | 'pendiente',
      notas: notas.trim() || null,
      fecha: new Date().toISOString().slice(0, 10),
    })
    setSubmitting(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setNotas('')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 rounded-lg bg-slate-50 p-2.5" noValidate>
      {error && (
        <Alert>
          <div>{error}</div>
        </Alert>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div>
          <label className={LABEL} htmlFor={`etapa-${postulacionId}`}>
            Avanzar a etapa
          </label>
          <select
            id={`etapa-${postulacionId}`}
            value={etapaId}
            onChange={(e) => setEtapaId(e.target.value)}
            disabled={submitting}
            className={SELECT}
          >
            <option value="">Seleccionar…</option>
            {etapas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor={`resultado-${postulacionId}`}>
            Resultado
          </label>
          <select
            id={`resultado-${postulacionId}`}
            value={resultado}
            onChange={(e) => setResultado(e.target.value)}
            disabled={submitting}
            className={SELECT}
          >
            <option value="pendiente">Pendiente</option>
            <option value="aprobado">Aprobado</option>
            <option value="rechazado">Rechazado</option>
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor={`notas-${postulacionId}`}>
            Notas (opcional)
          </label>
          <input
            id={`notas-${postulacionId}`}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            disabled={submitting}
            className={INPUT}
          />
        </div>
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? <Loader2 className={SPINNER} /> : null} Registrar etapa
      </Button>
    </form>
  )
}

function RejectButton({ postulacionId, onDone }: { postulacionId: number; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function close() {
    setOpen(false)
    setError(null)
    setMotivo('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (motivo.trim().length < 3) {
      setError('Describe brevemente el motivo.')
      return
    }
    setSubmitting(true)
    setError(null)
    const result = await rejectPostulacion({ postulacionId, motivo: motivo.trim() })
    setSubmitting(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    close()
    onDone()
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <XCircle className="h-3.5 w-3.5 text-rose-600" /> Descartar
      </Button>
      {open && (
        <Modal
          title="Descartar postulación"
          subtitle="Indica el motivo del descarte. No se puede deshacer."
          onClose={close}
        >
          <form onSubmit={handleSubmit} className="space-y-3" noValidate>
            {error && (
              <Alert>
                <div>{error}</div>
              </Alert>
            )}
            <div>
              <label className={LABEL} htmlFor={`motivo-${postulacionId}`}>
                Motivo del descarte
              </label>
              <input
                id={`motivo-${postulacionId}`}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                disabled={submitting}
                className={INPUT}
                autoFocus
              />
            </div>
            <Button type="submit" variant="danger" disabled={submitting} size="lg" block>
              {submitting ? <Loader2 className={SPINNER} /> : null} Descartar postulación
            </Button>
          </form>
        </Modal>
      )}
    </>
  )
}

function ScoreForm({
  postulacionId,
  criterios,
  existentes,
  canWrite,
}: {
  postulacionId: number
  criterios: CriterioSeleccionItem[]
  existentes: PostulacionDetalle['puntajes']
  canWrite: boolean
}) {
  const router = useRouter()
  const [scores, setScores] = useState<
    Record<number, { puntaje: string; noAplica: boolean; observacion: string }>
  >(() => {
    const initial: Record<number, { puntaje: string; noAplica: boolean; observacion: string }> = {}
    for (const c of criterios) {
      const existing = existentes.find((p) => p.criterioId === c.id)
      initial[c.id] = {
        puntaje:
          existing?.puntaje !== null && existing?.puntaje !== undefined
            ? String(existing.puntaje)
            : '',
        noAplica: existing?.noAplica ?? false,
        observacion: existing?.observacion ?? '',
      }
    }
    return initial
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [promedio, setPromedio] = useState<number | null>(
    existentes.length > 0
      ? (() => {
          const aplicables = existentes.filter((p) => !p.noAplica && p.puntaje !== null)
          if (aplicables.length === 0) return null
          return Math.round(
            aplicables.reduce((a, p) => a + (p.puntaje ?? 0), 0) / aplicables.length
          )
        })()
      : null
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const puntajes = criterios.map((c) => {
      const s = scores[c.id]
      return {
        criterioId: c.id,
        puntaje: s.noAplica || s.puntaje === '' ? null : Number(s.puntaje),
        noAplica: s.noAplica,
        observacion: s.observacion.trim() || null,
      }
    })

    const sinCompletar = puntajes.find((p) => !p.noAplica && p.puntaje === null)
    if (sinCompletar) {
      setSubmitting(false)
      setError('Complete el puntaje de todos los criterios o marque "No aplica".')
      return
    }

    const result = await savePostulacionScores({ postulacionId, puntajes })
    setSubmitting(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setPromedio(result.promedio)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2.5 border-t border-slate-100 pt-3" noValidate>
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
          Puntaje del candidato
        </p>
        {promedio !== null && (
          <Badge tone="amber">
            <Star className="h-2.5 w-2.5" /> Promedio: {promedio}
          </Badge>
        )}
      </div>

      {error && (
        <Alert>
          <div>{error}</div>
        </Alert>
      )}

      <div className="space-y-2">
        {criterios.map((c) => (
          <div
            key={c.id}
            className="grid grid-cols-[1fr_auto] items-start gap-2 sm:grid-cols-[2fr_auto_auto]"
          >
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-slate-800">{c.descripcion}</p>
              <p className="truncate text-[10px] text-slate-400">{c.areaNombre}</p>
            </div>
            <input
              type="number"
              min={0}
              max={10}
              step={1}
              disabled={!canWrite || submitting || scores[c.id]?.noAplica}
              value={scores[c.id]?.puntaje ?? ''}
              onChange={(e) =>
                setScores((prev) => ({
                  ...prev,
                  [c.id]: { ...prev[c.id], puntaje: e.target.value },
                }))
              }
              className={`${INPUT} w-16 sm:w-20`}
              aria-label={`Puntaje de ${c.descripcion}`}
            />
            <label className="flex items-center gap-1 text-[10px] text-slate-500 sm:col-start-3">
              <input
                type="checkbox"
                disabled={!canWrite || submitting}
                checked={scores[c.id]?.noAplica ?? false}
                onChange={(e) =>
                  setScores((prev) => ({
                    ...prev,
                    [c.id]: { ...prev[c.id], noAplica: e.target.checked, puntaje: '' },
                  }))
                }
              />
              No aplica
            </label>
          </div>
        ))}
      </div>

      {canWrite && (
        <Button type="submit" disabled={submitting} size="sm">
          {submitting ? <Loader2 className={SPINNER} /> : null} Guardar puntaje
        </Button>
      )}
    </form>
  )
}
