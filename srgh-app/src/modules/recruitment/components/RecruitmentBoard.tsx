'use client'

import { useEffect, useId, useMemo, useOptimistic, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import {
  CheckCircle2,
  ChevronsLeftRight,
  ChevronsRightLeft,
  Columns3,
  Plus,
  XCircle,
} from 'lucide-react'
import type { PostulacionBoardItem } from '@/modules/recruitment/actions/getPostulacionesBoard'
import { moveApplicationToStage } from '@/modules/recruitment/actions/moveApplicationToStage'
import { reorderSelectionStages } from '@/modules/recruitment/actions/reorderSelectionStages'
import { useIsPhone } from '@/hooks/useIsPhone'
import { useCollapsedColumns } from '@/modules/recruitment/hooks/useCollapsedColumns'
import type { EtapaSeleccionItem } from '@/modules/recruitment/types'
import type { CatalogoItem } from '@/modules/employees/types'
import { sortByScore } from '@/modules/recruitment/lib/scoring'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn } from '@/lib/utils/cn'
import { ApplicationActionsDialog } from './ApplicationActionsDialog'
import { ApplicationCardView } from './ApplicationCard'
import { BoardColumnNav } from './BoardColumnNav'
import { DiscardApplicationDialog } from './DiscardApplicationDialog'
import {
  BOARD_MIN_HEIGHT,
  KanbanColumn,
  UnplacedColumn,
  columnDomId,
  columnDragId,
} from './KanbanColumn'
import { MobileBoard } from './MobileBoard'
import { NuevoCandidatoForm } from './NuevoCandidatoForm'
import { StageColumnForm } from './StageColumnForm'

interface RecruitmentBoardProps {
  postulaciones: PostulacionBoardItem[]
  /** Etapas activas, en orden: cada una es una columna. */
  stages: EtapaSeleccionItem[]
  tiposIdentificacion: CatalogoItem[]
  puestos: CatalogoItem[]
  sucursales: CatalogoItem[]
  /** Mover, contratar y descartar (RECLUTAMIENTO_WRITE). */
  canWrite: boolean
  /** Crear, renombrar, reordenar y eliminar columnas (CATALOGOS_WRITE). */
  canManageStages: boolean
}

type DragData =
  | { type: 'card'; application: PostulacionBoardItem }
  | { type: 'column'; stage: EtapaSeleccionItem }
  | { type: 'zone'; zone: 'hire' | 'discard' }

type Dragging =
  | { type: 'card'; application: PostulacionBoardItem }
  | { type: 'column'; stage: EtapaSeleccionItem }
  | null

/**
 * Qué destino "gana" bajo el puntero.
 * - Arrastrando una COLUMNA solo compiten las otras columnas, por cercanía
 *   de centros (reordenar).
 * - Arrastrando una TARJETA gana lo que está bajo el puntero (columna o zona
 *   de Contratar/Descartar); si el puntero quedó en un hueco entre columnas,
 *   se usa el solapamiento de la tarjeta.
 */
const collisionDetection: CollisionDetection = (args) => {
  if ((args.active.data.current as DragData | undefined)?.type === 'column') {
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter(
        (container) => (container.data.current as DragData | undefined)?.type === 'column'
      ),
    })
  }
  const underPointer = pointerWithin(args)
  // Las zonas flotan sobre el borde inferior de las columnas: donde se
  // pisan, manda la zona, que es lo que se ve bajo el puntero.
  const zone = underPointer.find(
    (collision) =>
      (collision.data?.droppableContainer?.data.current as DragData | undefined)?.type === 'zone'
  )
  if (zone) return [zone]
  return underPointer.length > 0 ? underPointer : rectIntersection(args)
}

function labelOf(data: DragData | undefined): string {
  if (!data) return 'el elemento'
  if (data.type === 'card') return data.application.candidatoNombre
  if (data.type === 'column') return `la columna ${data.stage.nombre}`
  return data.zone === 'hire' ? 'Contratar' : 'Descartar'
}

// Lo que escucha un lector de pantalla durante el arrastre, en español (por
// defecto la librería lo anuncia en inglés).
const announcements: Announcements = {
  onDragStart: ({ active }) => `Levantaste ${labelOf(active.data.current as DragData)}.`,
  onDragOver: ({ active, over }) =>
    over
      ? `${labelOf(active.data.current as DragData)} está sobre ${labelOf(over.data.current as DragData)}.`
      : `${labelOf(active.data.current as DragData)} no está sobre ningún destino.`,
  onDragEnd: ({ active, over }) =>
    over
      ? `Soltaste ${labelOf(active.data.current as DragData)} en ${labelOf(over.data.current as DragData)}.`
      : `Soltaste ${labelOf(active.data.current as DragData)} sin moverlo.`,
  onDragCancel: ({ active }) =>
    `Arrastre cancelado: ${labelOf(active.data.current as DragData)} volvió a su lugar.`,
}

const screenReaderInstructions = {
  draggable:
    'Para reordenar una columna presione espacio, muévala con las flechas y presione espacio de nuevo para soltarla; Escape cancela. Para mover un candidato use el botón de acciones de su tarjeta.',
}

/**
 * Tablero Kanban de selección (SGRH-96).
 *
 * Cada columna es una etapa del proceso. Arrastrar una tarjeta a otra columna
 * la cambia de etapa — en cualquier dirección — y queda en el historial sin
 * preguntar nada. Mientras se arrastra aparecen abajo dos zonas, Contratar y
 * Descartar, que son las dos formas de sacar una postulación del tablero.
 *
 * Reemplaza al tablero de tres columnas fijas ("fases") con las etapas
 * adentro, donde mover a alguien exigía abrir su ficha, una ventana y elegir
 * un resultado.
 *
 * Los movimientos son optimistas (`useOptimistic`): la tarjeta salta de
 * columna al soltarla y, si el servidor rechaza el cambio, vuelve sola a su
 * lugar con un aviso.
 *
 * En el celular no se muestra este tablero sino MobileBoard: una etapa a la
 * vez, con pestañas — ver ese componente.
 *
 * Con muchas columnas: cada una se contrae a una franja (preferencia de quien
 * mira, se recuerda en el navegador), "Contraer vacías" lo hace de un toque, y
 * el índice de arriba lleva directo a cualquier columna.
 */
export function RecruitmentBoard({
  postulaciones,
  stages,
  tiposIdentificacion,
  puestos,
  sucursales,
  canWrite,
  canManageStages,
}: RecruitmentBoardProps) {
  const router = useRouter()
  // Id estable para los atributos ARIA que genera la librería: sin él el HTML
  // del servidor y el del navegador no coinciden al hidratar.
  const dndId = useId()
  // null mientras no se sabe el ancho (servidor / hidratación): ahí se pintan
  // las dos vistas y el CSS esconde la que no toca, para que no haya salto.
  const isPhone = useIsPhone()
  const [, startTransition] = useTransition()

  const [applications, applyMove] = useOptimistic(
    postulaciones,
    (state, move: { applicationId: number; stage: EtapaSeleccionItem }) =>
      state.map((application) =>
        application.posId === move.applicationId
          ? {
              ...application,
              etapaId: move.stage.id,
              etapaNombre: move.stage.nombre,
              etapaColor: move.stage.color,
            }
          : application
      )
  )
  const [columns, applyOrder] = useOptimistic(stages, (state, orderedIds: number[]) =>
    orderedIds.flatMap((id, index) => {
      const stage = state.find((candidate) => candidate.id === id)
      return stage ? [{ ...stage, orden: index }] : []
    })
  )

  const [dragging, setDragging] = useState<Dragging>(null)
  const [showNewCandidate, setShowNewCandidate] = useState(false)
  const [menuFor, setMenuFor] = useState<PostulacionBoardItem | null>(null)
  const [discarding, setDiscarding] = useState<PostulacionBoardItem | null>(null)
  const [editingStage, setEditingStage] = useState<EtapaSeleccionItem | 'new' | null>(null)

  const { collapsed, toggle: toggleCollapsed, collapse, expand } = useCollapsedColumns()
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState<ReadonlySet<number>>(() => new Set())

  const sensors = useSensors(
    // 6px de tolerancia: un clic normal sobre la tarjeta sigue abriendo la
    // ficha; recién al moverla empieza el arrastre.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Con el dedo hay que mantener apretado un instante: así deslizar para
    // scrollear el tablero no levanta tarjetas por accidente.
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const { byStage, unplaced } = useMemo(() => {
    const columnIds = new Set(columns.map((stage) => stage.id))
    const grouped = new Map<number, PostulacionBoardItem[]>()
    const withoutColumn: PostulacionBoardItem[] = []
    for (const application of applications) {
      if (application.etapaId !== null && columnIds.has(application.etapaId)) {
        const list = grouped.get(application.etapaId) ?? []
        list.push(application)
        grouped.set(application.etapaId, list)
      } else {
        withoutColumn.push(application)
      }
    }
    // Dentro de cada columna, mejor puntaje arriba: es lo que RRHH mira para
    // decidir a quién llamar primero. Por eso el orden no se arrastra.
    for (const [stageId, list] of grouped) grouped.set(stageId, sortByScore(list))
    return { byStage: grouped, unplaced: sortByScore(withoutColumn) }
  }, [applications, columns])

  const counts = useMemo(
    () => new Map(columns.map((stage) => [stage.id, byStage.get(stage.id)?.length ?? 0])),
    [columns, byStage]
  )
  const emptyExpanded = columns.filter(
    (stage) => (counts.get(stage.id) ?? 0) === 0 && !collapsed.has(stage.id)
  )
  const collapsedColumns = columns.filter((stage) => collapsed.has(stage.id))

  // Qué columnas están a la vista, para resaltarlas en el índice. Se vuelve a
  // observar cuando cambia el juego de columnas o su ancho (contraer).
  const layoutKey = columns
    .map((stage) => `${stage.id}${collapsed.has(stage.id) ? 'c' : ''}`)
    .join(',')
  useEffect(() => {
    const root = scrollerRef.current
    if (!root || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        setVisible((previous) => {
          const next = new Set(previous)
          for (const entry of entries) {
            const id = Number((entry.target as HTMLElement).dataset.stageId)
            if (entry.isIntersecting) next.add(id)
            else next.delete(id)
          }
          return next
        })
      },
      { root, threshold: 0.6 }
    )
    root.querySelectorAll('[data-stage-id]').forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [layoutKey, isPhone])

  /** Lleva el tablero hasta una columna; si estaba contraída, la abre. */
  function goToColumn(stageId: number) {
    if (collapsed.has(stageId)) expand([stageId])
    // Un cuadro después: si se acaba de expandir, ya tiene su ancho real.
    requestAnimationFrame(() => {
      const scroller = scrollerRef.current
      const column = document.getElementById(columnDomId(stageId))
      if (!scroller || !column) return
      const offset = column.getBoundingClientRect().left - scroller.getBoundingClientRect().left
      scroller.scrollTo({
        left: scroller.scrollLeft + offset,
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      })
    })
  }

  function moveTo(
    application: PostulacionBoardItem,
    stage: EtapaSeleccionItem,
    { confirm = false }: { confirm?: boolean } = {}
  ) {
    if (application.etapaId === stage.id) return
    startTransition(async () => {
      applyMove({ applicationId: application.posId, stage })
      const result = await moveApplicationToStage({
        applicationId: application.posId,
        stageId: stage.id,
      })
      if (!result.ok) {
        toast.error(result.error)
      } else if (confirm) {
        // Al arrastrar, la tarjeta moviéndose ya es la confirmación; desde
        // el menú (o el botón del celular) no se ve el movimiento, así que
        // se avisa — y se puede deshacer, porque es un solo toque.
        const previous = columns.find((column) => column.id === application.etapaId)
        toast.success(
          `${application.candidatoNombre} pasó a ${stage.nombre}.`,
          previous && {
            action: {
              label: 'Deshacer',
              onClick: () => moveTo({ ...application, etapaId: stage.id }, previous),
            },
          }
        )
      }
    })
  }

  function reorderColumns(fromStageId: number, toStageId: number) {
    const ids = columns.map((stage) => stage.id)
    const from = ids.indexOf(fromStageId)
    const to = ids.indexOf(toStageId)
    if (from < 0 || to < 0 || from === to) return
    const next = arrayMove(ids, from, to)
    startTransition(async () => {
      applyOrder(next)
      const result = await reorderSelectionStages(next)
      if (!result.ok) toast.error(result.error)
    })
  }

  function onDragStart(event: DragStartEvent) {
    const data = event.active.data.current as DragData | undefined
    if (data?.type === 'card') setDragging({ type: 'card', application: data.application })
    else if (data?.type === 'column') setDragging({ type: 'column', stage: data.stage })
  }

  function onDragEnd(event: DragEndEvent) {
    setDragging(null)
    const source = event.active.data.current as DragData | undefined
    const target = event.over?.data.current as DragData | undefined
    if (!source || !target) return

    if (source.type === 'column') {
      if (target.type === 'column') reorderColumns(source.stage.id, target.stage.id)
      return
    }
    if (source.type !== 'card') return

    if (target.type === 'column') {
      moveTo(source.application, target.stage)
    } else if (target.type === 'zone' && target.zone === 'hire') {
      const { candidatoId, posId } = source.application
      router.push(`/recruitment/candidates/${candidatoId}/hire?postulacionId=${posId}`)
    } else if (target.type === 'zone') {
      setDiscarding(source.application)
    }
  }

  const total = applications.length
  const isEmptyBoard = columns.length === 0 && unplaced.length === 0
  // Sin animación de "vuelta a su lugar" para quien pidió menos movimiento.
  const reducedMotion = prefersReducedMotion()

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 text-xs text-slate-500">
          {/* El plural pierde la tilde: postulación → postulaciones. */}
          {total} postulaci{total === 1 ? 'ón' : 'ones'} en proceso
          {canWrite && columns.length > 0 && (
            // En el celular no se arrastra (ver MobileBoard): la pista sobra.
            <span className="hidden sm:inline">
              {/* Con el dedo el gesto es otro: hay que mantener apretado. */}
              <span className="pointer-coarse:hidden">
                {' · arrastrá una tarjeta para cambiarla de etapa'}
              </span>
              <span className="hidden pointer-coarse:inline">
                {' · mantené apretada una tarjeta para moverla'}
              </span>
            </span>
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          {/* Una sola acción a la vez: primero ofrece despejar las vacías;
              cuando ya no queda ninguna abierta, ofrece volver a ver todo.
              Solo desde sm: en el celular se ve una etapa a la vez y no hay
              columnas que contraer. */}
          <span className="hidden sm:contents">
            {emptyExpanded.length > 0 ? (
              <Button
                variant="secondary"
                title="Contraer las columnas vacías"
                onClick={() => collapse(emptyExpanded.map((stage) => stage.id))}
              >
                <ChevronsRightLeft className="h-3.5 w-3.5" aria-hidden="true" />
                Contraer vacías
              </Button>
            ) : collapsedColumns.length > 0 ? (
              <Button
                variant="secondary"
                title="Expandir todas las columnas"
                onClick={() => expand(collapsedColumns.map((stage) => stage.id))}
              >
                <ChevronsLeftRight className="h-3.5 w-3.5" aria-hidden="true" />
                Expandir todas
              </Button>
            ) : null}
          </span>
          {canManageStages && (
            <Button variant="secondary" onClick={() => setEditingStage('new')} className="group">
              <Plus className={PLUS_ICON} aria-hidden="true" /> Columna
            </Button>
          )}
          {canWrite && (
            <Button onClick={() => setShowNewCandidate(true)} className="group">
              <Plus className={PLUS_ICON} aria-hidden="true" /> Nuevo candidato
            </Button>
          )}
        </div>
      </div>

      {isEmptyBoard ? (
        <EmptyState
          icon={Columns3}
          title="El tablero todavía no tiene columnas"
          description={
            canManageStages
              ? 'Cada columna es una etapa del proceso (por ejemplo: Recibido, Entrevista, Prueba práctica). Creá las que use la empresa, en el orden en que suceden.'
              : 'Las columnas son las etapas del proceso de selección. Pedile a un administrador que las cree.'
          }
          action={
            canManageStages && (
              <Button onClick={() => setEditingStage('new')} className="mt-1">
                <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Crear la primera columna
              </Button>
            )
          }
        />
      ) : (
        <>
          {isPhone !== false && (
            <div className={cn(isPhone === null && 'sm:hidden')}>
              <MobileBoard
                stages={columns}
                byStage={byStage}
                unplaced={unplaced}
                canWrite={canWrite}
                canManageStages={canManageStages}
                onMove={(application, stage) => moveTo(application, stage, { confirm: true })}
                onOpenMenu={setMenuFor}
                onEditStage={setEditingStage}
              />
            </div>
          )}
          {isPhone !== true && (
            <div className={cn('min-w-0 space-y-3', isPhone === null && 'hidden sm:block')}>
              <DndContext
                id={dndId}
                sensors={sensors}
                collisionDetection={collisionDetection}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onDragCancel={() => setDragging(null)}
                accessibility={{ announcements, screenReaderInstructions }}
              >
                {/*
            Scroll horizontal propio: el tablero puede tener más columnas de
            las que entran. En el celular las columnas "encajan" al deslizar
            (snap); en escritorio el scroll es libre.
          */}
                {columns.length > 1 && (
                  <BoardColumnNav
                    stages={columns}
                    counts={counts}
                    visible={visible}
                    onGo={goToColumn}
                  />
                )}

                <div
                  ref={scrollerRef}
                  className={cn(
                    'flex snap-x snap-mandatory items-stretch gap-3 overflow-x-auto pb-3 sm:snap-none',
                    BOARD_MIN_HEIGHT
                  )}
                >
                  {unplaced.length > 0 && (
                    <UnplacedColumn
                      applications={unplaced}
                      canWrite={canWrite}
                      onOpenMenu={setMenuFor}
                    />
                  )}
                  <SortableContext
                    items={columns.map((stage) => columnDragId(stage.id))}
                    strategy={horizontalListSortingStrategy}
                  >
                    {columns.map((stage) => (
                      <KanbanColumn
                        key={stage.id}
                        stage={stage}
                        applications={byStage.get(stage.id) ?? []}
                        canWrite={canWrite}
                        canManage={canManageStages}
                        cardInFlight={dragging?.type === 'card'}
                        collapsed={collapsed.has(stage.id)}
                        onToggleCollapse={toggleCollapsed}
                        onOpenMenu={setMenuFor}
                        onEdit={setEditingStage}
                      />
                    ))}
                  </SortableContext>
                  {canManageStages && (
                    <button
                      type="button"
                      onClick={() => setEditingStage('new')}
                      className="group flex min-h-28 w-44 shrink-0 snap-start items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 text-xs font-semibold text-slate-500 outline-none transition hover:border-brand-400 hover:bg-brand-50/50 hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500/60 active:scale-[0.98] motion-reduce:active:scale-100"
                    >
                      <Plus className={PLUS_ICON} aria-hidden="true" /> Agregar columna
                    </button>
                  )}
                </div>

                {dragging?.type === 'card' && <DropZones />}

                <DragOverlay dropAnimation={reducedMotion ? null : undefined}>
                  {dragging?.type === 'card' ? (
                    <ApplicationCardView application={dragging.application} floating />
                  ) : dragging?.type === 'column' ? (
                    <div
                      className="flex h-24 w-72 max-w-[80vw] rotate-1 cursor-grabbing items-start rounded-xl border-t-4 bg-slate-100 p-3 shadow-xl ring-2 ring-brand-500/40"
                      style={{ borderTopColor: dragging.stage.color ?? '#94a3b8' }}
                    >
                      <p className="truncate text-xs font-bold text-slate-800">
                        {dragging.stage.nombre}
                      </p>
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            </div>
          )}
        </>
      )}

      {showNewCandidate && (
        <Modal
          title="Nuevo candidato"
          subtitle="Registra al candidato y su primera postulación."
          onClose={() => setShowNewCandidate(false)}
        >
          <NuevoCandidatoForm
            tiposIdentificacion={tiposIdentificacion}
            puestos={puestos}
            sucursales={sucursales}
            onSuccess={() => setShowNewCandidate(false)}
          />
        </Modal>
      )}

      {menuFor && (
        <ApplicationActionsDialog
          application={menuFor}
          stages={columns}
          onClose={() => setMenuFor(null)}
          onMove={(stage) => {
            moveTo(menuFor, stage, { confirm: true })
            setMenuFor(null)
          }}
          onDiscard={() => {
            setDiscarding(menuFor)
            setMenuFor(null)
          }}
        />
      )}

      {discarding && (
        <DiscardApplicationDialog
          applicationId={discarding.posId}
          candidateName={discarding.candidatoNombre}
          onClose={() => setDiscarding(null)}
          onDone={() => router.refresh()}
        />
      )}

      {editingStage !== null && (
        <Modal
          title={
            editingStage === 'new' ? 'Nueva columna' : `Editar columna: ${editingStage.nombre}`
          }
          subtitle={
            editingStage === 'new'
              ? 'Se agrega al final del tablero. Después podés arrastrarla para acomodarla.'
              : undefined
          }
          onClose={() => setEditingStage(null)}
        >
          <StageColumnForm
            key={editingStage === 'new' ? 'new' : editingStage.id}
            stage={editingStage === 'new' ? undefined : editingStage}
            cardCount={editingStage === 'new' ? 0 : (byStage.get(editingStage.id)?.length ?? 0)}
            onDone={() => setEditingStage(null)}
          />
        </Modal>
      )}
    </div>
  )
}

// El "+" gira un cuarto de vuelta al pasar por el botón que lo contiene
// (que lleva la clase `group`).
const PLUS_ICON =
  'h-3.5 w-3.5 transition-transform duration-200 group-hover:rotate-90 motion-reduce:transition-none'

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function DropZone({ zone, delayMs = 0 }: { zone: 'hire' | 'discard'; delayMs?: number }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `zone-${zone}`,
    data: { type: 'zone', zone } satisfies DragData,
  })
  const hire = zone === 'hire'
  const Icon = hire ? CheckCircle2 : XCircle

  return (
    <div
      ref={setNodeRef}
      // El retraso va en línea: las animaciones del tablero no están en una
      // capa de cascada y le ganarían a una utilidad de Tailwind.
      style={{ animationDelay: `${delayMs}ms` }}
      className={cn(
        'animate-board-zone-in pointer-events-auto flex h-16 flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-sm font-bold shadow-lg transition duration-150 motion-reduce:transition-none sm:max-w-56',
        hire
          ? isOver
            ? 'scale-105 border-emerald-600 bg-emerald-600 text-white'
            : 'border-emerald-400 bg-white text-emerald-700'
          : isOver
            ? 'scale-105 border-rose-600 bg-rose-600 text-white'
            : 'border-rose-400 bg-white text-rose-700'
      )}
    >
      <Icon className={cn('h-5 w-5', isOver && 'motion-safe:animate-bounce')} aria-hidden="true" />
      {hire ? 'Contratar' : 'Descartar'}
    </div>
  )
}

/**
 * Zonas para sacar una postulación del tablero. Solo existen mientras hay
 * una tarjeta en el aire: no ocupan lugar el resto del tiempo, y aparecen
 * abajo, lejos de las columnas, para que no se suelte ahí por error.
 */
function DropZones() {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center gap-3 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <DropZone zone="hire" />
      <DropZone zone="discard" delayMs={50} />
    </div>
  )
}
