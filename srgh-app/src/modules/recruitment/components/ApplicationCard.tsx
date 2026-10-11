'use client'

import Link from 'next/link'
import { useDraggable } from '@dnd-kit/core'
import { Briefcase, MapPin, MoreHorizontal, Star } from 'lucide-react'
import type { PostulacionBoardItem } from '@/modules/recruitment/actions/getPostulacionesBoard'
import { formatDate } from '@/modules/employees/lib/format'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { ICON_CONTROL_BASE, ICON_CONTROL_TONES } from '@/components/ui/IconButton'
import { CARD } from '@/components/ui/styles'
import { cn } from '@/lib/utils/cn'

/** Id del arrastrable de una tarjeta; el tablero lo lee al soltar. */
export function cardDragId(applicationId: number) {
  return `card-${applicationId}`
}

interface ApplicationCardViewProps {
  application: PostulacionBoardItem
  /**
   * Muestra la etapa como etiqueta. Solo hace falta en "Sin etapa": en una
   * columna normal la etapa ya la dice la columna.
   */
  showStageLabel?: boolean
  /** Abre el menú de acciones. Sin él no se dibuja el botón (solo lectura). */
  onOpenMenu?: () => void
  /** La copia que sigue al puntero mientras se arrastra. */
  floating?: boolean
  /**
   * Acciones bajo la tarjeta, fuera del enlace a la ficha. Las usa la vista de
   * celular, donde no se arrastra: ahí va el paso siguiente a un toque.
   */
  footer?: React.ReactNode
  className?: string
}

/** Tarjeta sin comportamiento de arrastre: la usan la versión arrastrable y la copia flotante. */
export function ApplicationCardView({
  application,
  showStageLabel = false,
  onOpenMenu,
  floating = false,
  footer,
  className,
}: ApplicationCardViewProps) {
  return (
    <div
      className={cn(
        CARD,
        'relative min-w-0',
        floating
          ? 'rotate-2 cursor-grabbing shadow-xl ring-2 ring-brand-500/40'
          : // Se levanta apenas bajo el puntero y se hunde al apretarla: avisa
            // que se puede agarrar antes de que empiece el arrastre.
            'transition duration-150 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_6px_16px_rgba(15,23,42,.10)] active:translate-y-0 active:scale-[0.98] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100',
        className
      )}
    >
      <Link
        href={`/recruitment/candidates/${application.candidatoId}`}
        // draggable={false}: sin esto el navegador arranca SU arrastre de
        // enlaces (con su imagen fantasma) y le gana al del tablero.
        // touch-callout: en iPhone, mantener apretado un enlace abre la vista
        // previa, justo el gesto que acá inicia el arrastre.
        draggable={false}
        className="block min-w-0 rounded-[inherit] p-3 outline-none [-webkit-touch-callout:none] focus-visible:ring-2 focus-visible:ring-brand-500/60"
      >
        <div className={cn('flex items-start gap-2.5', onOpenMenu && 'pr-7')}>
          <Avatar nombre={application.candidatoNombre} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-slate-900">
              {application.candidatoNombre}
            </p>
            <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-slate-600">
              <Briefcase className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{application.puestoNombre}</span>
            </p>
            {application.sucursalNombre && (
              <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-slate-600">
                <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{application.sucursalNombre}</span>
              </p>
            )}
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-[10px] text-slate-500">
            {showStageLabel && application.etapaNombre
              ? `Estaba en: ${application.etapaNombre}`
              : `Postuló el ${formatDate(application.fechaPostula)}`}
          </span>
          {application.puntajePromedio !== null && (
            <Badge tone="amber" size="xs" className="shrink-0">
              <Star className="h-2.5 w-2.5" aria-hidden="true" /> {application.puntajePromedio}
              <span className="sr-only"> de 10</span>
            </Badge>
          )}
        </div>
      </Link>

      {footer}

      {onOpenMenu && !floating && (
        <button
          type="button"
          aria-label={`Acciones de ${application.candidatoNombre}`}
          // El menú no debe iniciar un arrastre: se corta el evento antes de
          // que llegue a los sensores de la tarjeta.
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onClick={onOpenMenu}
          className={cn(
            ICON_CONTROL_BASE,
            ICON_CONTROL_TONES.slate,
            'group absolute right-1 top-1 pointer-coarse:right-0 pointer-coarse:top-0'
          )}
        >
          <MoreHorizontal
            className="h-4 w-4 transition-transform duration-150 group-hover:rotate-90 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </button>
      )}
    </div>
  )
}

interface ApplicationCardProps {
  application: PostulacionBoardItem
  showStageLabel?: boolean
  /** Con permiso de escritura: se puede arrastrar y tiene menú. */
  canWrite: boolean
  onOpenMenu: (application: PostulacionBoardItem) => void
}

/**
 * Tarjeta del tablero. Se arrastra entera (mouse, o dedo manteniendo
 * apretado); el clic sin arrastrar abre la ficha. El teclado y quien no
 * quiera arrastrar usan el botón de acciones ("Mover a…").
 */
export function ApplicationCard({
  application,
  showStageLabel,
  canWrite,
  onOpenMenu,
}: ApplicationCardProps) {
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: cardDragId(application.posId),
    data: { type: 'card', application },
    disabled: !canWrite,
  })

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      className={cn(
        // Entrada: se ve al cargar y, sobre todo, cuando la tarjeta aterriza
        // en otra columna (ahí se monta de nuevo).
        'animate-board-card-in select-none',
        canWrite && 'cursor-grab touch-manipulation',
        // Mientras viaja la copia flotante, la original queda atenuada y sin
        // eventos: así soltarla sobre sí misma no dispara el enlace.
        isDragging && 'pointer-events-none opacity-40'
      )}
    >
      <ApplicationCardView
        application={application}
        showStageLabel={showStageLabel}
        onOpenMenu={canWrite ? () => onOpenMenu(application) : undefined}
      />
    </div>
  )
}
