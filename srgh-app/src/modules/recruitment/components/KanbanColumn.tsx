'use client'

import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronsLeftRight, ChevronsRightLeft, GripVertical, Pencil, UserRound } from 'lucide-react'
import type { PostulacionBoardItem } from '@/modules/recruitment/actions/getPostulacionesBoard'
import { STAGE_SOLID, stageTone } from '@/modules/recruitment/lib/stageTone'
import type { EtapaSeleccionItem } from '@/modules/recruitment/types'
import { EmptyState } from '@/components/ui/EmptyState'
import { IconButton } from '@/components/ui/IconButton'
import { cn } from '@/lib/utils/cn'
import { ApplicationCard } from './ApplicationCard'

/** Id de la columna como destino/arrastrable; el tablero lo lee al soltar. */
export function columnDragId(stageId: number) {
  return `column-${stageId}`
}

/** Id del elemento en el DOM: el navegador de columnas lo usa para ir a ella. */
export function columnDomId(stageId: number) {
  return `board-column-${stageId}`
}

// Ancho de columna: en el celular ocupa ~82% de la pantalla para que asome
// la siguiente (se entiende que hay más hacia el costado); desde sm, fijo.
const COLUMN_FRAME =
  'flex w-[82vw] max-w-[19rem] shrink-0 snap-start flex-col overflow-clip rounded-xl sm:w-72'

/*
 * El color de la etapa pinta la columna, no solo un punto: el encabezado va
 * a color pleno, el cuerpo con un velo del mismo tono, y contraída es una
 * franja entera de ese color. Así, con muchas columnas, cada una se reconoce
 * de lejos.
 *
 * El color es libre (lo elige el usuario), así que el texto que va encima se
 * calcula por contraste — ver lib/stageTone.ts. Los controles del encabezado
 * heredan ese color en vez de traer el suyo.
 */
const STAGE_SURFACE = 'bg-[color-mix(in_srgb,var(--stage)_16%,var(--color-slate-100))]'

/** Conteo de la columna: pastilla blanca, legible sobre cualquier color. */
function CountPill({ count }: { count: number }) {
  return (
    // key = el número: cuando cambia, la pastilla se vuelve a montar y da un
    // saltito (animate-board-count-pop) que lleva el ojo a la columna que cambió.
    <span
      key={count}
      className="animate-board-count-pop shrink-0 rounded-full bg-white/90 px-1.5 py-px text-[11px] font-bold tabular-nums text-slate-800"
    >
      {count}
    </span>
  )
}

// El tablero tiene alto propio (lo fija BOARD_MIN_HEIGHT en el contenedor) y
// las tarjetas scrollean DENTRO de la columna: así la barra de scroll
// horizontal queda siempre a la vista, por más candidatos que tenga una.
// Los rem que se restan son lo que ocupa lo de arriba (barra de la app,
// título, acciones e índice), que en el celular es más alto.
const COLUMN_BODY =
  'flex min-h-28 flex-1 flex-col gap-2 overflow-y-auto p-2 max-h-[max(18rem,calc(100dvh-25rem))] sm:max-h-[max(18rem,calc(100dvh-20rem))]'

/**
 * Alto mínimo del tablero. Va en el contenedor y no en cada columna para que
 * TODO lo que hay adentro llegue hasta abajo por igual: las columnas con
 * pocas tarjetas (un destino más fácil de acertar al arrastrar) y también las
 * contraídas — si no, con todas contraídas quedaban como botoncitos y el
 * nombre en vertical no entraba.
 */
export const BOARD_MIN_HEIGHT =
  'min-h-[max(14rem,calc(100dvh-21rem))] sm:min-h-[max(14rem,calc(100dvh-17rem))]'

// En el encabezado entran hasta tres controles; con el dedo se achican un
// poco de ancho (36px, siguen midiendo 44 de alto) para dejarle lugar al nombre.
// Heredan el color de texto del encabezado (ver stageTone): sus tonos propios
// de gris no se leerían sobre un color oscuro.
const HEADER_CONTROL =
  'pointer-coarse:min-w-9! text-current! opacity-75 hover:bg-black/10! hover:text-current! hover:opacity-100 focus-visible:ring-current!'

function candidatesLabel(count: number) {
  return `${count} ${count === 1 ? 'candidato' : 'candidatos'}`
}

interface ColumnHeaderProps {
  name: string
  color: string | null
  count: number
  children?: React.ReactNode
  leading?: React.ReactNode
}

function ColumnHeader({ name, color, count, children, leading }: ColumnHeaderProps) {
  return (
    <header
      style={stageTone(color)}
      className={cn('flex items-center gap-1.5 px-2 py-1.5', STAGE_SOLID)}
    >
      {leading}
      <h3 className="min-w-0 flex-1 truncate text-xs font-bold" title={name}>
        {name}
      </h3>
      <CountPill count={count} />
      {children}
    </header>
  )
}

interface KanbanColumnProps {
  stage: EtapaSeleccionItem
  applications: PostulacionBoardItem[]
  canWrite: boolean
  /** Puede renombrar, reordenar y eliminar columnas (CATALOGOS_WRITE). */
  canManage: boolean
  /** Hay una tarjeta en el aire: la columna se ofrece como destino. */
  cardInFlight: boolean
  /** Contraída a una franja angosta: preferencia de vista de cada persona. */
  collapsed: boolean
  onToggleCollapse: (stageId: number) => void
  onOpenMenu: (application: PostulacionBoardItem) => void
  onEdit: (stage: EtapaSeleccionItem) => void
}

/**
 * Una columna del tablero = una etapa del proceso.
 *
 * Es destino de tarjetas (soltar acá mueve la postulación a esta etapa) y, si
 * se tiene permiso, se reordena arrastrándola desde la manija del encabezado
 * — la manija y no toda la columna, para que arrastrar una tarjeta nunca
 * mueva la columna entera.
 *
 * Contraída queda como una franja con el nombre en vertical y el conteo:
 * sigue recibiendo tarjetas, así que con muchas columnas se pueden dejar
 * abiertas solo las que se están trabajando.
 */
export function KanbanColumn({
  stage,
  applications,
  canWrite,
  canManage,
  cardInFlight,
  collapsed,
  onToggleCollapse,
  onOpenMenu,
  onEdit,
}: KanbanColumnProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({
    id: columnDragId(stage.id),
    data: { type: 'column', stage },
    // Sin permiso (o contraída, que no tiene manija) no se reordena, pero la
    // columna sigue recibiendo tarjetas.
    disabled: { draggable: !canManage || collapsed, droppable: false },
  })

  const receiving = cardInFlight && isOver
  // La columna se abre/cierra con una animación solo cuando la tocó la
  // persona — no al cargar el tablero ni con "Contraer vacías", donde
  // moverían todas a la vez.
  const [toggled, setToggled] = useState(false)
  function toggle() {
    setToggled(true)
    onToggleCollapse(stage.id)
  }
  const label = `${stage.nombre}: ${candidatesLabel(applications.length)}`

  if (collapsed) {
    return (
      <section
        // key distinta a la de la versión expandida: al cambiar se monta de
        // nuevo y la animación de entrada vuelve a correr.
        key="collapsed"
        ref={setNodeRef}
        id={columnDomId(stage.id)}
        data-stage-id={stage.id}
        style={{
          ...stageTone(stage.color),
          transform: CSS.Translate.toString(transform),
          transition,
        }}
        aria-label={label}
        className={cn(
          'flex w-11 shrink-0 snap-start flex-col overflow-clip rounded-xl outline-2 -outline-offset-2 outline-transparent transition-[outline-color,background-color,color,scale] duration-150 motion-reduce:transition-none',
          toggled && 'animate-board-column-in',
          receiving ? 'scale-105 bg-brand-50 text-slate-800 outline-brand-500/60' : STAGE_SOLID
        )}
      >
        <button
          type="button"
          onClick={toggle}
          aria-expanded={false}
          aria-label={`Expandir la columna ${stage.nombre} (${candidatesLabel(applications.length)})`}
          title={`${stage.nombre} · ${candidatesLabel(applications.length)}`}
          className="group flex min-h-0 flex-1 flex-col items-center gap-2 px-1 py-2 outline-none transition hover:bg-black/10 focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-inset"
        >
          <ChevronsLeftRight
            className="h-3.5 w-3.5 shrink-0 opacity-75 transition-transform duration-150 group-hover:scale-x-150 group-hover:opacity-100 motion-reduce:transition-none"
            aria-hidden="true"
          />
          <CountPill count={applications.length} />
          <span className="min-h-0 flex-1 truncate text-start text-xs font-bold [writing-mode:vertical-rl]">
            {stage.nombre}
          </span>
        </button>
      </section>
    )
  }

  return (
    <section
      key="expanded"
      ref={setNodeRef}
      id={columnDomId(stage.id)}
      data-stage-id={stage.id}
      style={{
        ...stageTone(stage.color),
        transform: CSS.Translate.toString(transform),
        transition,
      }}
      aria-label={label}
      className={cn(
        COLUMN_FRAME,
        'outline-2 -outline-offset-2 outline-transparent transition-[outline-color,background-color,scale] duration-150 motion-reduce:transition-none',
        toggled && 'animate-board-column-in',
        // Al recibir, la columna crece apenas: confirma "acá cae" antes de soltar.
        receiving ? 'scale-[1.015] bg-brand-50 outline-brand-500/60' : STAGE_SURFACE,
        isDragging && 'opacity-40'
      )}
    >
      <ColumnHeader
        name={stage.nombre}
        color={stage.color}
        count={applications.length}
        leading={
          canManage && (
            <button
              ref={setActivatorNodeRef}
              type="button"
              {...attributes}
              {...listeners}
              aria-label={`Reordenar la columna ${stage.nombre}`}
              className="-ml-1 flex h-6 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded opacity-70 outline-none transition hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-current active:cursor-grabbing pointer-coarse:h-11 pointer-coarse:w-8"
            >
              <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )
        }
      >
        <IconButton
          tone="slate"
          onClick={toggle}
          aria-expanded
          aria-label={`Contraer la columna ${stage.nombre}`}
          title="Contraer"
          className={cn(HEADER_CONTROL, 'group', !canManage && '-mr-1')}
        >
          <ChevronsRightLeft
            className="h-3.5 w-3.5 transition-transform duration-150 group-hover:scale-x-75 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </IconButton>
        {canManage && (
          <IconButton
            tone="slate"
            onClick={() => onEdit(stage)}
            aria-label={`Editar la columna ${stage.nombre}`}
            title="Editar"
            className={cn(HEADER_CONTROL, 'group -mr-1')}
          >
            <Pencil
              className="h-3.5 w-3.5 transition-transform duration-150 group-hover:-rotate-12 motion-reduce:transition-none"
              aria-hidden="true"
            />
          </IconButton>
        )}
      </ColumnHeader>

      <div className={COLUMN_BODY}>
        {applications.map((application) => (
          <ApplicationCard
            key={application.posId}
            application={application}
            canWrite={canWrite}
            onOpenMenu={onOpenMenu}
          />
        ))}
        {applications.length === 0 &&
          (cardInFlight ? (
            <p
              className={cn(
                'flex flex-1 items-center justify-center rounded-lg border border-dashed px-3 py-6 text-center text-[11px] transition-colors',
                receiving
                  ? 'border-brand-400 text-brand-700'
                  : // Mientras hay una tarjeta en el aire el hueco late: "acá también".
                    'animate-board-drop-hint border-slate-400/60 text-slate-500'
              )}
            >
              Soltá acá
            </p>
          ) : (
            // El estado vacío animado del sistema, en su tamaño chico: puede
            // haber varias columnas vacías a la vez, y la escena completa
            // (que simula la mirada) es para un solo lugar por pantalla.
            <div className="flex flex-1 items-center justify-center px-1 py-4">
              <EmptyState size="sm" framed={false} icon={UserRound} title="Sin candidatos" />
            </div>
          ))}
      </div>
    </section>
  )
}

interface UnplacedColumnProps {
  applications: PostulacionBoardItem[]
  canWrite: boolean
  onOpenMenu: (application: PostulacionBoardItem) => void
}

/**
 * Postulaciones que no están en ninguna columna: recién creadas cuando no
 * había columnas, o paradas en una etapa que después se eliminó. No es una
 * etapa y por eso no recibe tarjetas — solo se sacan de acá hacia una
 * columna real. El tablero la muestra únicamente si tiene algo, y no se
 * contrae: es lo que hay que resolver.
 */
export function UnplacedColumn({ applications, canWrite, onOpenMenu }: UnplacedColumnProps) {
  return (
    <section
      aria-label={`Sin etapa: ${candidatesLabel(applications.length)}`}
      className={cn(COLUMN_FRAME, 'border border-dashed border-amber-300 bg-amber-50/60')}
    >
      <ColumnHeader name="Sin etapa" color="#fbbf24" count={applications.length} />
      <p className="px-2.5 pt-1 text-[11px] leading-snug text-amber-800">
        Arrastralos a la columna que corresponda.
      </p>
      <div className={COLUMN_BODY}>
        {applications.map((application) => (
          <ApplicationCard
            key={application.posId}
            application={application}
            showStageLabel
            canWrite={canWrite}
            onOpenMenu={onOpenMenu}
          />
        ))}
      </div>
    </section>
  )
}
