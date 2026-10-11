'use client'

import { useId, useOptimistic, useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ArrowDown,
  ArrowUp,
  Columns3,
  ExternalLink,
  GripVertical,
  Pencil,
  Plus,
} from 'lucide-react'
import { reorderSelectionStages } from '@/modules/recruitment/actions/reorderSelectionStages'
import type { InactiveStageItem, StageColumnAdminItem } from '@/modules/recruitment/types'
import { BUTTON_BASE, BUTTON_SIZES, BUTTON_VARIANTS, Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { IconButton } from '@/components/ui/IconButton'
import { Modal } from '@/components/ui/Modal'
import { CARD } from '@/components/ui/styles'
import { cn } from '@/lib/utils/cn'
import { InactiveStagesSection } from './InactiveStagesSection'
import { StageColumnForm } from './StageColumnForm'

interface StageColumnsManagerProps {
  /** Columnas activas, en el orden del tablero. */
  stages: StageColumnAdminItem[]
  /** Etapas desactivadas: no son columnas, pero se pueden restaurar. */
  inactive?: InactiveStageItem[]
}

/**
 * Administración de las columnas del tablero desde Configuración.
 *
 * Hace lo mismo que se puede hacer sobre el propio tablero (crear, renombrar,
 * cambiar el color, reordenar, eliminar), pero como lista: con muchas
 * columnas se ven todas de una y el orden se lee de arriba hacia abajo. La
 * lista ES el orden del tablero, de izquierda a derecha.
 *
 * Reordenar tiene dos caminos: arrastrar la fila desde la manija, o las
 * flechas — que son el camino con el dedo, donde arrastrar una fila se
 * confunde con scrollear la página.
 *
 * Abajo, plegadas, las etapas desactivadas — ver InactiveStagesSection.
 */
export function StageColumnsManager({ stages, inactive = [] }: StageColumnsManagerProps) {
  // Id estable para los atributos ARIA de la librería (ver RecruitmentBoard).
  const dndId = useId()
  const [, startTransition] = useTransition()
  const [rows, applyOrder] = useOptimistic(stages, (state, orderedIds: number[]) =>
    orderedIds.flatMap((id) => state.find((stage) => stage.id === id) ?? [])
  )
  const [editing, setEditing] = useState<StageColumnAdminItem | 'new' | null>(null)
  // La fila que se acaba de mover o restaurar destella un instante: en una
  // lista de filas parecidas, dice cuál fue.
  const [flashId, setFlashId] = useState<number | null>(null)

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function reorder(from: number, to: number) {
    if (from < 0 || to < 0 || to >= rows.length || from === to) return
    const next = arrayMove(
      rows.map((stage) => stage.id),
      from,
      to
    )
    setFlashId(rows[from].id)
    startTransition(async () => {
      applyOrder(next)
      const result = await reorderSelectionStages(next)
      if (!result.ok) toast.error(result.error)
    })
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over) return
    const ids = rows.map((stage) => stage.id)
    reorder(ids.indexOf(Number(active.id)), ids.indexOf(Number(over.id)))
  }

  return (
    <div className="max-w-2xl min-w-0 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <p className="min-w-0 flex-1 basis-64 text-xs leading-relaxed text-slate-500">
          Cada etapa del proceso es una columna del tablero. El orden de esta lista es el orden de
          las columnas, de izquierda a derecha.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/recruitment"
            className={cn(BUTTON_BASE, BUTTON_VARIANTS.secondary, BUTTON_SIZES.sm)}
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Ver tablero
          </Link>
          <Button onClick={() => setEditing('new')} className="group">
            <Plus
              className="h-3.5 w-3.5 transition-transform duration-200 group-hover:rotate-90 motion-reduce:transition-none"
              aria-hidden="true"
            />{' '}
            Nueva columna
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Columns3}
          title="Todavía no hay columnas"
          description="Creá las etapas que use la empresa, en el orden en que suceden (por ejemplo: Recibido, Entrevista, Prueba práctica). Sin columnas el tablero no puede mostrar en qué va cada candidato."
          action={
            <Button onClick={() => setEditing('new')} className="mt-1">
              <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Crear la primera columna
            </Button>
          }
        />
      ) : (
        <DndContext
          id={dndId}
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={rows.map((stage) => stage.id)}
            strategy={verticalListSortingStrategy}
          >
            <ol
              aria-label="Columnas del tablero, en orden"
              className={cn(CARD, 'divide-y divide-slate-100')}
            >
              {rows.map((stage, index) => (
                <StageRow
                  key={stage.id}
                  stage={stage}
                  index={index}
                  total={rows.length}
                  flash={flashId === stage.id}
                  onFlashEnd={() => setFlashId(null)}
                  onMove={(delta) => reorder(index, index + delta)}
                  onEdit={() => setEditing(stage)}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}

      <InactiveStagesSection stages={inactive} onRestored={setFlashId} />

      {editing !== null && (
        <Modal
          title={editing === 'new' ? 'Nueva columna' : `Editar columna: ${editing.nombre}`}
          subtitle={
            editing === 'new'
              ? 'Se agrega al final. Después podés subirla o bajarla en la lista.'
              : undefined
          }
          onClose={() => setEditing(null)}
        >
          <StageColumnForm
            key={editing === 'new' ? 'new' : editing.id}
            stage={editing === 'new' ? undefined : editing}
            cardCount={editing === 'new' ? 0 : editing.cardCount}
            onDone={() => setEditing(null)}
          />
        </Modal>
      )}
    </div>
  )
}

interface StageRowProps {
  stage: StageColumnAdminItem
  index: number
  total: number
  flash: boolean
  onFlashEnd: () => void
  onMove: (delta: -1 | 1) => void
  onEdit: () => void
}

function StageRow({ stage, index, total, flash, onFlashEnd, onMove, onEdit }: StageRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stage.id })

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      onAnimationEnd={flash ? onFlashEnd : undefined}
      className={cn(
        'flex items-center gap-2 bg-white px-2 py-1.5 transition-colors first:rounded-t-[inherit] last:rounded-b-[inherit] hover:bg-slate-50 sm:px-3',
        flash && 'animate-row-flash',
        isDragging && 'relative z-10 rounded-lg shadow-lg ring-2 ring-brand-500/40'
      )}
    >
      {/* Con el dedo se reordena con las flechas: la manija sobra y le saca
          lugar al nombre. */}
      <button
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Reordenar ${stage.nombre}`}
        className="flex h-7 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-slate-400 outline-none transition hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-brand-500/60 active:cursor-grabbing pointer-coarse:hidden"
      >
        <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <span
        aria-hidden="true"
        className="hidden w-5 shrink-0 text-center text-[11px] font-semibold tabular-nums text-slate-400 sm:block"
      >
        {index + 1}
      </span>
      <span
        aria-hidden="true"
        className="h-3 w-3 shrink-0 rounded-full border border-black/10"
        style={{ backgroundColor: stage.color ?? '#cbd5e1' }}
      />
      <div className="min-w-0 flex-1 py-1">
        <p className="text-xs font-semibold break-words text-slate-900">{stage.nombre}</p>
        <p className="text-[11px] text-slate-500">
          {stage.cardCount === 0
            ? 'Sin candidatos'
            : `${stage.cardCount} ${stage.cardCount === 1 ? 'candidato' : 'candidatos'} en proceso`}
        </p>
      </div>
      <div className="flex shrink-0 items-center">
        <IconButton
          onClick={() => onMove(-1)}
          disabled={index === 0}
          aria-label={`Subir ${stage.nombre}`}
          title="Subir"
          className="group"
        >
          <ArrowUp
            className="h-3.5 w-3.5 transition-transform duration-150 group-hover:-translate-y-0.5 group-disabled:translate-y-0 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </IconButton>
        <IconButton
          onClick={() => onMove(1)}
          disabled={index === total - 1}
          aria-label={`Bajar ${stage.nombre}`}
          title="Bajar"
          className="group"
        >
          <ArrowDown
            className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-y-0.5 group-disabled:translate-y-0 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </IconButton>
        <IconButton
          tone="blue"
          onClick={onEdit}
          aria-label={`Editar ${stage.nombre}`}
          title="Editar"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        </IconButton>
      </div>
    </li>
  )
}
