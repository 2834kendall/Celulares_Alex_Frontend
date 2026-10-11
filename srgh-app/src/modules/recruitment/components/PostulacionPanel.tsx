'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  History,
  Loader2,
  Shuffle,
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
import { nextStage } from '@/modules/recruitment/lib/stages'
import { formatDate } from '@/modules/employees/lib/format'
import { moveApplicationToStage } from '@/modules/recruitment/actions/moveApplicationToStage'
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
import { DiscardApplicationDialog } from './DiscardApplicationDialog'

interface PostulacionPanelProps {
  candidatoId: number
  postulacion: PostulacionDetalle
  /** Columnas del tablero (etapas activas), en orden. */
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
 * Arriba, en qué etapa va (barra de pasos, igual a las columnas del tablero)
 * y las acciones: pasar a la siguiente etapa de un toque, moverla a
 * cualquier otra, contratar o descartar. Abajo, plegados, el puntaje y el
 * historial.
 *
 * Pasar de etapa ya no pide resultado (aprobado / rechazado / pendiente): el
 * movimiento mismo lo dice. Ver moveToStageSchema.
 */
export function PostulacionPanel({
  candidatoId,
  postulacion,
  etapas,
  criterios,
  canWrite,
}: PostulacionPanelProps) {
  const [isMoving, startMove] = useTransition()
  const [choosingStage, setChoosingStage] = useState(false)
  const [discarding, setDiscarding] = useState(false)

  const enProceso = postulacion.pos_estado_final === 'en_proceso'
  const currentColumn = postulacion.etapaActual
    ? (etapas.find((stage) => stage.id === postulacion.etapaActual?.id) ?? null)
    : null
  const next = nextStage(etapas, currentColumn)
  const hireHref = `/recruitment/candidates/${candidatoId}/hire?postulacionId=${postulacion.pos_id}`

  function moveTo(stage: EtapaSeleccionItem, note?: string | null) {
    startMove(async () => {
      const result = await moveApplicationToStage({
        applicationId: postulacion.pos_id,
        stageId: stage.id,
        note,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`Pasó a ${stage.nombre}.`)
    })
  }

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
                  El tablero todavía no tiene columnas. Las etapas se crean en el{' '}
                  <Link
                    href="/recruitment"
                    className="font-semibold underline underline-offset-2 hover:no-underline"
                  >
                    tablero de Reclutamiento
                  </Link>
                  .
                </div>
              </Alert>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                {next ? (
                  // Un toque y pasa a la siguiente: es el caso de todos los
                  // días, no merece una ventana.
                  <Button
                    size="md"
                    onClick={() => moveTo(next)}
                    disabled={isMoving}
                    className="group w-full justify-center sm:w-auto"
                  >
                    {isMoving && <Loader2 className={SPINNER} />}
                    <span className="truncate">Pasar a: {next.nombre}</span>
                    <ArrowRight
                      className="h-3.5 w-3.5 shrink-0 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none"
                      aria-hidden="true"
                    />
                  </Button>
                ) : (
                  <p className="text-xs text-slate-500">Está en la última etapa: falta decidir.</p>
                )}
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => setChoosingStage(true)}
                  disabled={isMoving}
                  className="sm:mr-auto"
                >
                  <Shuffle className="h-3.5 w-3.5" aria-hidden="true" /> Otra etapa
                </Button>
                <div className="flex gap-2">
                  {/* Enlace con apariencia de botón, no un <Button> dentro de un
                      <Link> (HTML inválido: el teclado se detenía dos veces).
                      En la última etapa pasa a ser la acción principal. */}
                  <Link
                    href={hireHref}
                    className={cn(
                      BUTTON_BASE,
                      BUTTON_VARIANTS[next ? 'secondary' : 'primary'],
                      BUTTON_SIZES.md,
                      'flex-1 sm:flex-none'
                    )}
                  >
                    <CheckCircle2
                      className={cn('h-3.5 w-3.5', next ? 'text-emerald-600' : 'text-white')}
                      aria-hidden="true"
                    />{' '}
                    Contratar
                  </Link>
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={() => setDiscarding(true)}
                    className="flex-1 sm:flex-none"
                  >
                    <XCircle className="h-3.5 w-3.5 text-rose-600" aria-hidden="true" /> Descartar
                  </Button>
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
                    {/* Solo los registros anteriores a SGRH-96 traen
                        resultado; los nuevos son simplemente "pasó a…". */}
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

      {choosingStage && (
        <MoveStageDialog
          stages={etapas}
          currentStageId={currentColumn?.id ?? null}
          onClose={() => setChoosingStage(false)}
          onMove={(stage, note) => {
            setChoosingStage(false)
            moveTo(stage, note)
          }}
        />
      )}

      {discarding && (
        <DiscardApplicationDialog
          applicationId={postulacion.pos_id}
          onClose={() => setDiscarding(false)}
        />
      )}
    </div>
  )
}

/**
 * Mover a una etapa que no es la siguiente — devolverla a una anterior o
 * saltarse pasos — con una nota opcional que queda en el historial. La
 * etapa actual no se ofrece: no sería un movimiento.
 */
function MoveStageDialog({
  stages,
  currentStageId,
  onMove,
  onClose,
}: {
  stages: EtapaSeleccionItem[]
  currentStageId: number | null
  onMove: (stage: EtapaSeleccionItem, note: string | null) => void
  onClose: () => void
}) {
  const options = stages.filter((stage) => stage.id !== currentStageId)
  const [stageId, setStageId] = useState(options[0] ? String(options[0].id) : '')
  const [note, setNote] = useState('')
  const selected = options.find((stage) => String(stage.id) === stageId) ?? null

  return (
    <Modal
      title="Mover a otra etapa"
      subtitle="Podés devolverla a una etapa anterior o saltarte pasos. Queda en el historial."
      onClose={onClose}
    >
      <form
        className="space-y-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          if (selected) onMove(selected, note.trim() || null)
        }}
      >
        <div>
          <label className={LABEL} htmlFor="move-stage">
            Etapa
          </label>
          <SelectMenu
            id="move-stage"
            value={stageId}
            onChange={setStageId}
            options={options.map((stage) => ({ value: String(stage.id), label: stage.nombre }))}
          />
        </div>
        <div>
          <label className={LABEL} htmlFor="move-note">
            Nota (opcional)
          </label>
          <input
            id="move-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={INPUT}
            maxLength={300}
            placeholder="Ej: faltó la prueba práctica, se reprograma"
          />
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" size="lg" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" size="lg" disabled={!selected}>
            Mover
          </Button>
        </div>
      </form>
    </Modal>
  )
}

interface ScoreState extends ScoreValue {
  observacion: string
}

// 'pending' = se tocó algo y el guardado sale en un instante (ver AUTOSAVE_DELAY_MS).
type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

// Cuánto se espera después del último toque antes de guardar. Junta varios
// cambios seguidos en un solo guardado: con el teclado, cada flecha cambia el
// puntaje, y sin esta pausa serían diez pedidos para llegar del 0 al 10.
const AUTOSAVE_DELAY_MS = 500

type ScoresPayload = Parameters<typeof savePostulacionScores>[0]

/**
 * Puntaje de la postulación, criterio por criterio.
 *
 * No hay botón de guardar: cada calificación se guarda sola y el promedio —
 * el anillo de arriba y el número de la tarjeta en el tablero — va cambiando
 * conforme se evalúa. Se puede calificar de a poco: lo que falta simplemente
 * no entra todavía en el promedio.
 */
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
  const [scores, setScores] = useState<Record<number, ScoreState>>(() => {
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
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  // Estado del guardado automático. Va en refs y no en estado porque lo leen
  // callbacks diferidos (el temporizador, la respuesta del servidor) que
  // necesitan el valor de AHORA, no el del render en que nacieron.
  const pendingPayload = useRef<ScoresPayload | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saving = useRef(false)

  // Promedio EN VIVO mientras se califica, con el mismo cálculo ponderado
  // que usa el servidor al guardar (savePostulacionScores): así el número
  // que se ve al tocar es exactamente el que queda guardado.
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
  const noAplican = criterios.filter((c) => scores[c.id]?.noAplica).length
  const calificados = criterios.length - pendientes - noAplican

  async function save() {
    timer.current = null
    // Ya hay un guardado en viaje: al volver, verá que quedó algo pendiente
    // y saldrá otra vez con lo último.
    if (saving.current) return
    const payload = pendingPayload.current
    if (!payload) return

    pendingPayload.current = null
    saving.current = true
    setStatus('saving')
    const result = await savePostulacionScores(payload)
    saving.current = false

    if (pendingPayload.current) {
      // Se siguió calificando mientras tanto: lo que vale es lo último.
      void save()
      return
    }
    if (!result.ok) {
      // Se conserva para "Reintentar": nada de lo calificado se pierde.
      pendingPayload.current = payload
      setError(result.error)
      setStatus('error')
      return
    }
    setError(null)
    setStatus('saved')
  }

  function rate(criterioId: number, next: ScoreValue) {
    const updated = { ...scores, [criterioId]: { ...scores[criterioId], ...next } }
    setScores(updated)

    // Solo viaja lo ya calificado: un criterio sin tocar no es un 0.
    const puntajes = criterios
      .filter((c) => updated[c.id].noAplica || updated[c.id].puntaje !== null)
      .map((c) => ({
        criterioId: c.id,
        puntaje: updated[c.id].noAplica ? null : updated[c.id].puntaje,
        noAplica: updated[c.id].noAplica,
        observacion: updated[c.id].observacion.trim() || null,
      }))
    pendingPayload.current = { postulacionId, puntajes }

    setError(null)
    setStatus('pending')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void save(), AUTOSAVE_DELAY_MS)
  }

  // Si se sale de la ficha con un cambio todavía en la pausa, se guarda igual.
  useEffect(
    () => () => {
      if (timer.current === null) return
      clearTimeout(timer.current)
      if (pendingPayload.current) void savePostulacionScores(pendingPayload.current)
    },
    []
  )

  const busy = status === 'pending' || status === 'saving'

  return (
    <CollapsibleSection
      title="Puntaje"
      icon={Star}
      summary={
        <>
          {/* Visible aunque la sección esté cerrada: algo no llegó a guardarse. */}
          {status === 'error' && (
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
              {/* No se deshabilita mientras guarda: se sigue calificando de
                  corrido y el guardado alcanza a lo último. */}
              <ScoreScale
                label={c.areaNombre}
                value={scores[c.id]}
                disabled={!canWrite}
                onChange={(next) => rate(c.id, next)}
              />
            </div>
          ))}
        </div>

        {canWrite && (
          // aria-live: quien usa lector de pantalla también se entera de que
          // se guardó (o de que no) sin haber apretado nada.
          <div
            className="flex min-h-6 flex-wrap items-center gap-x-2 gap-y-1 text-[11px]"
            aria-live="polite"
          >
            {busy && (
              <span className="flex items-center gap-1.5 text-slate-500">
                <Loader2 className={SPINNER} /> Guardando…
              </span>
            )}
            {status === 'saved' && (
              <span className="animate-fade-in flex items-center gap-1 font-semibold text-emerald-700">
                <Check className="h-3.5 w-3.5" aria-hidden="true" /> Guardado
              </span>
            )}
            {status === 'error' && (
              <>
                <span className="font-semibold text-rose-700">
                  {error ?? 'No se pudo guardar el puntaje.'}
                </span>
                <button
                  type="button"
                  onClick={() => void save()}
                  className="rounded font-semibold text-brand-700 underline underline-offset-2 outline-none hover:no-underline focus-visible:ring-2 focus-visible:ring-brand-500/60 pointer-coarse:min-h-11"
                >
                  Reintentar
                </button>
              </>
            )}
            {status === 'idle' && (
              <span className="text-slate-500">Se guarda solo al calificar.</span>
            )}
            {status !== 'error' && pendientes > 0 && (
              <span className="text-slate-500">
                · {pendientes === 1 ? 'Falta 1 criterio' : `Faltan ${pendientes} criterios`}
              </span>
            )}
          </div>
        )}
      </div>
    </CollapsibleSection>
  )
}
