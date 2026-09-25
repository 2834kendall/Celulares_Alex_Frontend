'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CheckCircle2, ChevronRight, Loader2, Star, XCircle } from 'lucide-react'
import type {
  CriterioSeleccionItem,
  EtapaSeleccionItem,
  PostulacionDetalle,
} from '@/modules/recruitment/types'
import { ESTADO_POSTULACION_LABELS, RESULTADO_ETAPA_LABELS } from '@/modules/recruitment/lib/format'
import { weightedAverageScore } from '@/modules/recruitment/lib/scoring'
import { classifyScore } from '@/modules/evaluations/lib/scoring'
import { formatDate } from '@/modules/employees/lib/format'
import { advanceStage } from '@/modules/recruitment/actions/advanceStage'
import { rejectPostulacion } from '@/modules/recruitment/actions/rejectPostulacion'
import { savePostulacionScores } from '@/modules/recruitment/actions/savePostulacionScores'
import { Badge } from '@/components/ui/Badge'
import { Button, BUTTON_BASE, BUTTON_SIZES, BUTTON_VARIANTS } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { Modal } from '@/components/ui/Modal'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { INPUT, LABEL, SPINNER } from '@/components/ui/styles'
import { cn } from '@/lib/utils/cn'
import { ScoreScale, type ScoreValue } from './ScoreScale'

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

// Título de sección del panel. En minúscula normal y no en versalitas con
// tracking: son varias secciones seguidas y en mayúsculas competían con el
// nombre del puesto.
const SECTION_TITLE = 'text-xs font-semibold text-slate-700'

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

      <p className="text-[11px] text-slate-500">
        Postuló el {formatDate(postulacion.pos_fecha_postula)}
        {postulacion.pos_fecha_cierre &&
          ` · Cerrada el ${formatDate(postulacion.pos_fecha_cierre)}`}
      </p>

      {postulacion.pos_estado_final === 'contratado' && postulacion.pos_empleado_id && (
        <Link
          href={`/employees/${postulacion.pos_empleado_id}`}
          className="inline-flex items-center gap-1 rounded text-xs font-semibold text-brand-700 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand-500/60"
        >
          Ver ficha del empleado <ChevronRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      )}

      {postulacion.pos_estado_final === 'descartado' && postulacion.pos_motivo_descarte && (
        <Alert tone="warning">
          <div>Motivo: {postulacion.pos_motivo_descarte}</div>
        </Alert>
      )}

      {postulacion.etapas.length > 0 && (
        <div className="space-y-1.5 border-t border-slate-100 pt-2.5">
          <p className={SECTION_TITLE}>Historial de etapas</p>
          <ul className="space-y-1.5">
            {postulacion.etapas.map((etapa) => (
              <li key={etapa.pet_id} className="flex items-start gap-2 text-xs">
                <span className="mt-0.5 shrink-0 tabular-nums text-slate-500">
                  {formatDate(etapa.pet_fecha)}
                </span>
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
            {/*
              Enlace con apariencia de botón, no un <Button> dentro de un
              <Link>: eso es HTML inválido (dos controles anidados) y el
              teclado se detenía dos veces en "Contratar".
            */}
            <Link
              href={`/recruitment/candidates/${candidatoId}/hire?postulacionId=${postulacion.pos_id}`}
              className={cn(BUTTON_BASE, BUTTON_VARIANTS.secondary, BUTTON_SIZES.sm)}
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /> Contratar
            </Link>
            <RejectButton postulacionId={postulacion.pos_id} onDone={() => router.refresh()} />
          </div>
        </div>
      )}
    </div>
  )
}

type Resultado = 'pendiente' | 'aprobado' | 'rechazado'

// Botones segmentados y no un desplegable: son tres opciones fijas, se ven
// todas de una vez y se eligen de un toque. El color solo aparece en la
// elegida, para no pintar de verde y rojo un formulario que todavía no dice
// nada.
const RESULTADOS: { value: Resultado; selected: string }[] = [
  { value: 'pendiente', selected: 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' },
  { value: 'aprobado', selected: 'bg-emerald-600 text-white shadow-sm' },
  { value: 'rechazado', selected: 'bg-rose-600 text-white shadow-sm' },
]

function AdvanceStageForm({
  postulacionId,
  etapas,
}: {
  postulacionId: number
  etapas: EtapaSeleccionItem[]
}) {
  const router = useRouter()
  const [etapaId, setEtapaId] = useState('')
  const [resultado, setResultado] = useState<Resultado>('pendiente')
  const [notas, setNotas] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Catálogo vacío es el estado inicial normal desde SGRH-61: las etapas ya
  // no vienen sembradas, las define la empresa. Mostrar un selector vacío
  // dejaría a RRHH sin saber qué pasó, así que se explica y se manda al
  // lugar donde se arreglan.
  if (etapas.length === 0) {
    return (
      <Alert tone="info">
        <div>
          Todavía no hay etapas definidas, así que no se puede registrar por dónde va el candidato.
          Se crean en{' '}
          <Link
            href="/settings?tab=etapas"
            className="font-semibold underline underline-offset-2 hover:no-underline"
          >
            Configuración → Etapas de selección
          </Link>
          .
        </div>
      </Alert>
    )
  }

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
      resultado,
      notas: notas.trim() || null,
      fecha: new Date().toISOString().slice(0, 10),
    })
    setSubmitting(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    const nombre = etapas.find((etapa) => String(etapa.id) === etapaId)?.nombre
    toast.success(nombre ? `Etapa registrada: ${nombre}.` : 'Etapa registrada.')
    setEtapaId('')
    setResultado('pendiente')
    setNotas('')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2.5 rounded-lg bg-slate-50 p-2.5" noValidate>
      {error && (
        <Alert>
          <div>{error}</div>
        </Alert>
      )}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor={`etapa-${postulacionId}`}>
            Avanzar a etapa
          </label>
          <SelectMenu
            id={`etapa-${postulacionId}`}
            value={etapaId}
            onChange={(v) => {
              setEtapaId(v)
              setError(null)
            }}
            disabled={submitting}
            invalid={error === 'Seleccione una etapa.'}
            options={etapas.map((etapa) => ({ value: String(etapa.id), label: etapa.nombre }))}
          />
        </div>
        <div>
          <span className={LABEL} id={`resultado-${postulacionId}`}>
            Resultado
          </span>
          <div
            role="radiogroup"
            aria-labelledby={`resultado-${postulacionId}`}
            className="grid grid-cols-3 gap-1 rounded-xl bg-slate-200/60 p-1"
          >
            {RESULTADOS.map((opcion) => {
              const checked = resultado === opcion.value
              return (
                <button
                  key={opcion.value}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  disabled={submitting}
                  onClick={() => setResultado(opcion.value)}
                  className={cn(
                    'rounded-lg px-1 py-1.5 text-center text-xs leading-tight font-semibold outline-none transition pointer-coarse:min-h-11 sm:px-2 focus-visible:ring-2 focus-visible:ring-brand-500/60 active:scale-[0.97] motion-reduce:active:scale-100 disabled:cursor-not-allowed',
                    checked ? opcion.selected : 'text-slate-600 hover:text-slate-900'
                  )}
                >
                  {RESULTADO_ETAPA_LABELS[opcion.value]}
                </button>
              )
            })}
          </div>
        </div>
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
          placeholder="Ej: buena actitud, pidió horario de tarde"
        />
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting && <Loader2 className={SPINNER} />}
        {submitting ? 'Registrando' : 'Registrar etapa'}
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
    toast.success('Postulación descartada.')
    close()
    onDone()
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <XCircle className="h-3.5 w-3.5 text-rose-600" aria-hidden="true" /> Descartar
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
                placeholder="Ej: no tiene disponibilidad los fines de semana"
                autoFocus
              />
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" size="lg" onClick={close} disabled={submitting}>
                Cancelar
              </Button>
              <Button type="submit" variant="danger" disabled={submitting} size="lg">
                {submitting && <Loader2 className={SPINNER} />} Descartar postulación
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}

interface ScoreState extends ScoreValue {
  observacion: string
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
  const [guardados, setGuardados] = useState<Record<number, ScoreState>>(() => {
    const initial: Record<number, ScoreState> = {}
    for (const c of criterios) {
      const existing = existentes.find((p) => p.criterioId === c.id)
      initial[c.id] = {
        puntaje: existing?.puntaje ?? null,
        noAplica: existing?.noAplica ?? false,
        observacion: existing?.observacion ?? '',
      }
    }
    return initial
  })
  const [scores, setScores] = useState(guardados)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Promedio EN VIVO mientras se califica, con el mismo cálculo ponderado
  // que usa el servidor al guardar (savePostulacionScores): así el número
  // que se ve al tocar es exactamente el que va a quedar guardado.
  const promedio = useMemo(
    () =>
      weightedAverageScore(
        criterios.map((c) => ({
          puntaje: scores[c.id]?.noAplica ? null : (scores[c.id]?.puntaje ?? null),
          peso: c.peso,
        }))
      ),
    [criterios, scores]
  )

  const pendientes = criterios.filter(
    (c) => !scores[c.id]?.noAplica && scores[c.id]?.puntaje === null
  ).length
  const hayCambios = criterios.some(
    (c) =>
      scores[c.id]?.puntaje !== guardados[c.id]?.puntaje ||
      scores[c.id]?.noAplica !== guardados[c.id]?.noAplica
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (pendientes > 0) {
      setError(
        `Falta${pendientes === 1 ? '' : 'n'} ${pendientes} criterio${pendientes === 1 ? '' : 's'}: elija un puntaje o N/A.`
      )
      return
    }
    setSubmitting(true)
    setError(null)

    const puntajes = criterios.map((c) => {
      const s = scores[c.id]
      return {
        criterioId: c.id,
        puntaje: s.noAplica ? null : s.puntaje,
        noAplica: s.noAplica,
        observacion: s.observacion.trim() || null,
      }
    })

    const result = await savePostulacionScores({ postulacionId, puntajes })
    setSubmitting(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setGuardados(scores)
    toast.success(
      result.promedio !== null ? `Puntaje guardado: ${result.promedio}/10.` : 'Puntaje guardado.'
    )
    router.refresh()
  }

  const clasificacion = promedio !== null ? classifyScore(promedio) : null

  return (
    <form onSubmit={handleSubmit} className="space-y-3 border-t border-slate-100 pt-3" noValidate>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={SECTION_TITLE}>Puntaje del candidato</p>
        {promedio !== null && clasificacion && (
          <Badge tone={clasificacion.tone}>
            <Star className="h-2.5 w-2.5" aria-hidden="true" /> Promedio: {promedio}/10
          </Badge>
        )}
      </div>

      {error && (
        <Alert>
          <div>{error}</div>
        </Alert>
      )}

      <div className="space-y-3">
        {criterios.map((c) => (
          <div key={c.id} className="space-y-1.5">
            <div className="flex min-w-0 items-start gap-2">
              <span
                aria-hidden="true"
                className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full border border-black/10"
                style={{ backgroundColor: c.color ?? '#e2e8f0' }}
              />
              {/*
                Igual que en Configuración: el nombre del criterio (el del
                área) es el título, y la descripción es la ayuda de qué se
                califica. Si la descripción repite el nombre, no se muestra
                dos veces.
              */}
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-800">{c.areaNombre}</p>
                {(c.descripcion.trim() !== c.areaNombre.trim() || c.peso !== 1) && (
                  <p className="text-[11px] text-slate-500">
                    {c.descripcion.trim() !== c.areaNombre.trim() && c.descripcion}
                    {c.descripcion.trim() !== c.areaNombre.trim() && c.peso !== 1 && ' · '}
                    {c.peso !== 1 && `pesa ×${c.peso}`}
                  </p>
                )}
              </div>
            </div>
            <ScoreScale
              label={c.areaNombre}
              value={scores[c.id]}
              disabled={!canWrite || submitting}
              onChange={(next) => {
                setScores((prev) => ({ ...prev, [c.id]: { ...prev[c.id], ...next } }))
                setError(null)
              }}
            />
          </div>
        ))}
      </div>

      {canWrite && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <Button type="submit" disabled={submitting || !hayCambios}>
            {submitting && <Loader2 className={SPINNER} />}
            {submitting ? 'Guardando' : 'Guardar puntaje'}
          </Button>
          {/* aria-live: quien usa lector de pantalla también se entera de
              que hay cambios sin guardar o de cuántos faltan. */}
          <p className="text-[11px] text-slate-500" aria-live="polite">
            {hayCambios
              ? pendientes > 0
                ? `Cambios sin guardar · faltan ${pendientes}`
                : 'Cambios sin guardar'
              : null}
          </p>
        </div>
      )}
    </form>
  )
}
