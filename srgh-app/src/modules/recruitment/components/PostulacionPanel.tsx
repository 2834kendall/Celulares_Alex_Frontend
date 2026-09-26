'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  History,
  Loader2,
  Star,
  XCircle,
} from 'lucide-react'
import type {
  CriterioSeleccionItem,
  EtapaSeleccionItem,
  PostulacionDetalle,
} from '@/modules/recruitment/types'
import { ESTADO_POSTULACION_LABELS, RESULTADO_ETAPA_LABELS } from '@/modules/recruitment/lib/format'
import { weightedAverageScore } from '@/modules/recruitment/lib/scoring'
import { stagesAfter } from '@/modules/recruitment/lib/stages'
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
import { ScoreRing } from './ScoreRing'
import { StageStepper } from './StageStepper'
import { CollapsibleSection } from './CollapsibleSection'

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

/**
 * Una postulación en la ficha del candidato.
 *
 * Orden pensado para lo que RRHH hace más seguido: arriba en qué etapa va
 * (barra de pasos) y las tres acciones — Avanzar, Contratar, Descartar —; abajo,
 * plegados, el puntaje y el historial. Antes todo iba abierto y los botones de
 * decisión quedaban al fondo, debajo de las siete escalas de puntaje.
 */
export function PostulacionPanel({
  candidatoId,
  postulacion,
  etapas,
  criterios,
  canWrite,
}: PostulacionPanelProps) {
  const router = useRouter()
  const enProceso = postulacion.pos_estado_final === 'en_proceso'
  // Solo hacia adelante: las etapas anteriores a la actual no se ofrecen (y
  // el servidor también lo rechaza, ver advanceStage).
  const siguientes = stagesAfter(etapas, postulacion.etapaActual)
  const hireHref = `/recruitment/candidates/${candidatoId}/hire?postulacionId=${postulacion.pos_id}`

  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,.04)]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900">
            {postulacion.puestoNombre}
            {postulacion.sucursalNombre && (
              <span className="font-medium text-slate-500"> · {postulacion.sucursalNombre}</span>
            )}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Postuló el {formatDate(postulacion.pos_fecha_postula)}
            {postulacion.pos_fecha_cierre &&
              ` · Cerrada el ${formatDate(postulacion.pos_fecha_cierre)}`}
          </p>
        </div>
        <Badge tone={ESTADO_TONE[postulacion.pos_estado_final] ?? 'blue'}>
          {ESTADO_POSTULACION_LABELS[postulacion.pos_estado_final] ?? postulacion.pos_estado_final}
        </Badge>
      </div>

      {postulacion.pos_estado_final === 'contratado' && postulacion.pos_empleado_id && (
        <Link
          href={`/employees/${postulacion.pos_empleado_id}`}
          className="mt-2 inline-flex items-center gap-1 rounded text-xs font-semibold text-brand-700 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand-500/60"
        >
          Ver ficha del empleado <ChevronRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      )}

      {postulacion.pos_estado_final === 'descartado' && postulacion.pos_motivo_descarte && (
        <div className="mt-2">
          <Alert tone="warning">
            <div>Motivo: {postulacion.pos_motivo_descarte}</div>
          </Alert>
        </div>
      )}

      {enProceso && (
        <div className="mt-3 space-y-3">
          <StageStepper stages={etapas} current={postulacion.etapaActual} />

          {canWrite &&
            (etapas.length === 0 ? (
              <Alert tone="info">
                <div>
                  Todavía no hay etapas definidas. Se crean en{' '}
                  <Link
                    href="/settings?tab=etapas"
                    className="font-semibold underline underline-offset-2 hover:no-underline"
                  >
                    Configuración → Etapas de selección
                  </Link>
                  .
                </div>
              </Alert>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {siguientes.length > 0 ? (
                  <AdvanceStageButton postulacionId={postulacion.pos_id} siguientes={siguientes} />
                ) : (
                  <p className="self-center text-xs text-slate-500 sm:mr-auto">
                    Ya pasó por todas las etapas: falta decidir.
                  </p>
                )}
                <div className="flex gap-2">
                  {/* Enlace con apariencia de botón, no un <Button> dentro de un
                      <Link> (HTML inválido: el teclado se detenía dos veces).
                      En la última etapa pasa a ser la acción principal. */}
                  <Link
                    href={hireHref}
                    className={cn(
                      BUTTON_BASE,
                      BUTTON_VARIANTS[siguientes.length > 0 ? 'secondary' : 'primary'],
                      BUTTON_SIZES.md,
                      'flex-1 sm:flex-none'
                    )}
                  >
                    <CheckCircle2
                      className={cn(
                        'h-3.5 w-3.5',
                        siguientes.length > 0 ? 'text-emerald-600' : 'text-white'
                      )}
                      aria-hidden="true"
                    />{' '}
                    Contratar
                  </Link>
                  <RejectButton
                    postulacionId={postulacion.pos_id}
                    onDone={() => router.refresh()}
                  />
                </div>
              </div>
            ))}
        </div>
      )}

      <div className="mt-3">
        {/* Una postulación cerrada ya no se califica: el puntaje queda de solo
            lectura, y si nunca se calificó ni se muestra. */}
        {criterios.length > 0 && (enProceso || postulacion.puntajes.length > 0) && (
          <ScoreForm
            postulacionId={postulacion.pos_id}
            criterios={criterios}
            existentes={postulacion.puntajes}
            canWrite={canWrite && enProceso}
          />
        )}

        {postulacion.etapas.length > 0 && (
          <CollapsibleSection
            title="Historial"
            icon={History}
            summary={`${postulacion.etapas.length} ${postulacion.etapas.length === 1 ? 'registro' : 'registros'}`}
          >
            <ul className="space-y-2">
              {postulacion.etapas.map((etapa) => (
                <li key={etapa.pet_id} className="flex items-start gap-2 text-xs">
                  <span className="mt-px shrink-0 tabular-nums text-slate-500">
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
          </CollapsibleSection>
        )}
      </div>
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

/**
 * "Avanzar a: <siguiente etapa>". Abre una ventana con la siguiente etapa ya
 * elegida: el caso normal es un toque para abrir y otro para confirmar. Solo
 * ofrece etapas posteriores a la actual.
 */
function AdvanceStageButton({
  postulacionId,
  siguientes,
}: {
  postulacionId: number
  siguientes: EtapaSeleccionItem[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [etapaId, setEtapaId] = useState(String(siguientes[0].id))
  const [resultado, setResultado] = useState<Resultado>('pendiente')
  const [notas, setNotas] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function openModal() {
    // Siempre arranca en la etapa inmediata siguiente.
    setEtapaId(String(siguientes[0].id))
    setResultado('pendiente')
    setNotas('')
    setError(null)
    setOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
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
    const nombre = siguientes.find((etapa) => String(etapa.id) === etapaId)?.nombre
    toast.success(nombre ? `Etapa registrada: ${nombre}.` : 'Etapa registrada.')
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <Button size="md" onClick={openModal} className="w-full justify-center sm:mr-auto sm:w-auto">
        <span className="truncate">Avanzar a: {siguientes[0].nombre}</span>
        <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      </Button>

      {open && (
        <Modal
          title="Registrar etapa"
          subtitle="Solo se puede avanzar: las etapas anteriores ya no se ofrecen."
          onClose={() => setOpen(false)}
        >
          <form onSubmit={handleSubmit} className="space-y-3" noValidate>
            {error && (
              <Alert>
                <div>{error}</div>
              </Alert>
            )}
            <div>
              <label className={LABEL} htmlFor={`etapa-${postulacionId}`}>
                Etapa
              </label>
              <SelectMenu
                id={`etapa-${postulacionId}`}
                value={etapaId}
                onChange={setEtapaId}
                disabled={submitting}
                options={siguientes.map((etapa) => ({
                  value: String(etapa.id),
                  label: etapa.nombre,
                }))}
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
                        'rounded-lg px-1 py-1.5 text-center text-xs leading-tight font-semibold outline-none transition pointer-coarse:min-h-11 focus-visible:ring-2 focus-visible:ring-brand-500/60 active:scale-[0.97] motion-reduce:active:scale-100 disabled:cursor-not-allowed sm:px-2',
                        checked ? opcion.selected : 'text-slate-600 hover:text-slate-900'
                      )}
                    >
                      {RESULTADO_ETAPA_LABELS[opcion.value]}
                    </button>
                  )
                })}
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
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="secondary"
                size="lg"
                onClick={() => setOpen(false)}
                disabled={submitting}
              >
                Cancelar
              </Button>
              <Button type="submit" size="lg" disabled={submitting}>
                {submitting && <Loader2 className={SPINNER} />}
                {submitting ? 'Registrando' : 'Registrar etapa'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
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
      <Button
        variant="secondary"
        size="md"
        onClick={() => setOpen(true)}
        className="flex-1 sm:flex-none"
      >
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
  const noAplican = criterios.filter((c) => scores[c.id]?.noAplica).length
  const calificados = criterios.length - pendientes - noAplican

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

  return (
    <form onSubmit={handleSubmit} noValidate>
      <CollapsibleSection
        title="Puntaje"
        icon={Star}
        summary={
          <>
            {/* Aviso visible aunque la sección esté cerrada: se tocó algo
                y no se guardó. */}
            {hayCambios && (
              <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-px text-[10px] font-semibold text-amber-700">
                Sin guardar
              </span>
            )}
            <ScoreRing
              compact
              score={promedio}
              scored={calificados}
              notApplicable={noAplican}
              total={criterios.length}
            />
          </>
        }
      >
        <div className="space-y-3">
          <ScoreRing
            score={promedio}
            scored={calificados}
            notApplicable={noAplican}
            total={criterios.length}
          />

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
        </div>
      </CollapsibleSection>
    </form>
  )
}
