'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { ArrowRight, CheckCircle2, MoreHorizontal, Pencil, UserRound } from 'lucide-react'
import type { PostulacionBoardItem } from '@/modules/recruitment/actions/getPostulacionesBoard'
import { useBoardTab, type BoardTab } from '@/modules/recruitment/hooks/useBoardTab'
import { nextStage } from '@/modules/recruitment/lib/stages'
import { STAGE_SOLID, stageTone } from '@/modules/recruitment/lib/stageTone'
import type { EtapaSeleccionItem } from '@/modules/recruitment/types'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn } from '@/lib/utils/cn'
import { ApplicationCardView } from './ApplicationCard'

interface MobileBoardProps {
  /** Columnas del tablero (etapas activas), en orden. */
  stages: EtapaSeleccionItem[]
  byStage: ReadonlyMap<number, PostulacionBoardItem[]>
  /** Postulaciones que no están en ninguna columna. */
  unplaced: PostulacionBoardItem[]
  canWrite: boolean
  canManageStages: boolean
  onMove: (application: PostulacionBoardItem, stage: EtapaSeleccionItem) => void
  onOpenMenu: (application: PostulacionBoardItem) => void
  onEditStage: (stage: EtapaSeleccionItem) => void
}

interface Tab {
  key: BoardTab
  nombre: string
  color: string | null
  count: number
}

const UNPLACED_COLOR = '#fbbf24'
// Cuánto hay que deslizar (px) para cambiar de etapa, y cuánto más horizontal
// que vertical tiene que ser el gesto: scrollear la lista no debe cambiarla.
const SWIPE_DISTANCE = 64
const SWIPE_RATIO = 2

/**
 * El tablero en el celular: UNA etapa a la vez.
 *
 * Un Kanban de columnas no entra en 375px: se veía una columna y un cachito
 * de la siguiente, con scroll dentro de scroll, y mover a alguien era
 * arrastrarlo hasta el borde para que el tablero corriera. Acá las etapas son
 * pestañas (arriba, siempre a la vista) y la lista de candidatos es la página
 * misma, sin scroll propio.
 *
 * Mover no se arrastra: cada tarjeta trae el paso de todos los días — "Pasar
 * a: (la siguiente)" — a un toque, y el resto (otra etapa, contratar,
 * descartar) en su menú. También se cambia de etapa deslizando la lista hacia
 * los lados.
 */
export function MobileBoard({
  stages,
  byStage,
  unplaced,
  canWrite,
  canManageStages,
  onMove,
  onOpenMenu,
  onEditStage,
}: MobileBoardProps) {
  const [stored, select] = useBoardTab()
  const stripRef = useRef<HTMLElement>(null)
  const touchStart = useRef<{ x: number; y: number } | null>(null)

  const tabs: Tab[] = [
    // "Sin etapa" va primero: es lo que hay que resolver.
    ...(unplaced.length > 0
      ? [
          {
            key: 'unplaced' as const,
            nombre: 'Sin etapa',
            color: UNPLACED_COLOR,
            count: unplaced.length,
          },
        ]
      : []),
    ...stages.map((stage) => ({
      key: stage.id,
      nombre: stage.nombre,
      color: stage.color,
      count: byStage.get(stage.id)?.length ?? 0,
    })),
  ]

  // Sin elección (o si esa etapa ya no existe): la primera que tenga a alguien.
  const selected =
    tabs.find((tab) => tab.key === stored) ?? tabs.find((tab) => tab.count > 0) ?? tabs[0]
  const selectedIndex = tabs.indexOf(selected)
  const stage = stages.find((candidate) => candidate.id === selected?.key) ?? null
  const cards = stage ? (byStage.get(stage.id) ?? []) : unplaced
  // Desde "Sin etapa" se entra por la primera columna.
  const next = stage ? nextStage(stages, stage) : (stages[0] ?? null)

  // La pestaña elegida se mantiene a la vista. Se mueve solo la tira
  // (scrollTo), nunca la página.
  const selectedKey = selected?.key
  useEffect(() => {
    const strip = stripRef.current
    if (!strip || selectedKey === undefined) return
    const chip = strip.querySelector<HTMLElement>(`[data-tab="${selectedKey}"]`)
    if (!chip) return
    const stripBox = strip.getBoundingClientRect()
    const chipBox = chip.getBoundingClientRect()
    if (chipBox.left >= stripBox.left && chipBox.right <= stripBox.right) return
    strip.scrollTo?.({
      left:
        strip.scrollLeft + (chipBox.left - stripBox.left) - (stripBox.width - chipBox.width) / 2,
    })
  }, [selectedKey])

  if (!selected) return null

  function onTouchEnd(event: React.TouchEvent) {
    const start = touchStart.current
    touchStart.current = null
    const end = event.changedTouches[0]
    if (!start || !end) return
    const dx = end.clientX - start.x
    const dy = end.clientY - start.y
    if (Math.abs(dx) < SWIPE_DISTANCE || Math.abs(dx) < Math.abs(dy) * SWIPE_RATIO) return
    const target = tabs[selectedIndex + (dx < 0 ? 1 : -1)]
    if (target) select(target.key)
  }

  const countLabel = `${cards.length} ${cards.length === 1 ? 'candidato' : 'candidatos'}`

  return (
    <div className="min-w-0 space-y-2">
      {/*
        Pegada bajo la barra de la app (h-16): al bajar por una etapa larga se
        puede cambiar de etapa sin volver arriba. Sangra hasta los bordes de
        la pantalla (el `main` tiene p-4) para que las pestañas no se corten
        en el margen.
      */}
      <nav
        ref={stripRef}
        aria-label="Etapas del proceso"
        className="sticky top-16 z-20 -mx-4 flex gap-1.5 overflow-x-auto bg-(--page-bg) px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((tab) => {
          const isSelected = tab.key === selected.key
          return (
            <button
              key={tab.key}
              type="button"
              data-tab={tab.key}
              onClick={() => select(tab.key)}
              aria-current={isSelected ? 'true' : undefined}
              aria-label={`${tab.nombre}: ${tab.count} ${tab.count === 1 ? 'candidato' : 'candidatos'}`}
              style={stageTone(tab.color)}
              className={cn(
                'flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-brand-500/60 active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100',
                isSelected
                  ? cn(STAGE_SOLID, 'border-transparent shadow-sm')
                  : 'border-slate-200 bg-white text-slate-600'
              )}
            >
              {!isSelected && (
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 shrink-0 rounded-full border border-black/10 bg-(--stage)"
                />
              )}
              <span className="max-w-40 truncate">{tab.nombre}</span>
              <span
                key={tab.count}
                className={cn(
                  'animate-board-count-pop rounded-full px-1.5 py-px text-[11px] font-bold tabular-nums',
                  isSelected ? 'bg-white/90 text-slate-800' : 'bg-slate-100 text-slate-600'
                )}
              >
                {tab.count}
              </span>
            </button>
          )
        })}
      </nav>

      <section
        aria-label={`${selected.nombre}: ${countLabel}`}
        style={stageTone(selected.color)}
        onTouchStart={(event) => {
          const touch = event.touches[0]
          touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null
        }}
        onTouchEnd={onTouchEnd}
        // Alto mínimo: deslizar para cambiar de etapa funciona aunque la
        // etapa tenga una sola tarjeta (o ninguna).
        className="min-h-[50dvh] space-y-2"
      >
        <div className="flex min-h-9 items-center justify-between gap-2">
          <p className="min-w-0 text-[11px] text-slate-500">
            {stage
              ? cards.length > 1
                ? `${countLabel} · mejor puntaje primero`
                : countLabel
              : 'No están en ninguna columna: pasalos a la que corresponda.'}
          </p>
          {canManageStages && stage && (
            <button
              type="button"
              onClick={() => onEditStage(stage)}
              aria-label={`Editar la columna ${stage.nombre}`}
              className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[11px] font-semibold text-slate-600 outline-none transition focus-visible:ring-2 focus-visible:ring-brand-500/60 active:bg-slate-100"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Editar columna
            </button>
          )}
        </div>

        {cards.length === 0 ? (
          // El mismo estado vacío animado del resto del sistema (la figura
          // junto a la caja vacía). Acá entra la escena completa porque se ve
          // una sola etapa a la vez.
          <EmptyState
            icon={UserRound}
            title="Sin candidatos en esta etapa"
            description={
              stage && stage.id === stages[0]?.id
                ? 'Los candidatos nuevos entran por acá.'
                : 'Cuando alguien pase a esta etapa va a aparecer acá.'
            }
          />
        ) : (
          <ul className="space-y-2">
            {cards.map((application) => (
              <li key={application.posId} className="animate-board-card-in">
                <ApplicationCardView
                  application={application}
                  showStageLabel={!stage}
                  // El borde izquierdo ata la tarjeta al color de su etapa.
                  className="border-l-4 border-l-(--stage)"
                  footer={
                    canWrite && (
                      <CardActions
                        application={application}
                        next={next}
                        // En la última etapa el paso natural ya no es otra
                        // etapa: es decidir.
                        offerHire={stage !== null && next === null}
                        onMove={onMove}
                        onOpenMenu={onOpenMenu}
                      />
                    )
                  }
                />
              </li>
            ))}
          </ul>
        )}

        {tabs.length > 1 && (
          <p className="pt-1 text-center text-[11px] text-slate-400">
            Deslizá hacia los lados para cambiar de etapa
          </p>
        )}
      </section>
    </div>
  )
}

interface CardActionsProps {
  application: PostulacionBoardItem
  next: EtapaSeleccionItem | null
  offerHire: boolean
  onMove: (application: PostulacionBoardItem, stage: EtapaSeleccionItem) => void
  onOpenMenu: (application: PostulacionBoardItem) => void
}

const CARD_ACTION =
  'flex min-h-11 min-w-0 flex-1 items-center gap-1.5 px-3 text-xs font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500/60'

/** Pie de la tarjeta en el celular: el paso siguiente a un toque, y el menú. */
function CardActions({ application, next, offerHire, onMove, onOpenMenu }: CardActionsProps) {
  return (
    <div className="flex items-stretch border-t border-slate-100">
      {next ? (
        <button
          type="button"
          onClick={() => onMove(application, next)}
          className={cn(CARD_ACTION, 'text-brand-700 active:bg-brand-50')}
        >
          <span className="truncate">Pasar a: {next.nombre}</span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        </button>
      ) : offerHire ? (
        <Link
          href={`/recruitment/candidates/${application.candidatoId}/hire?postulacionId=${application.posId}`}
          className={cn(CARD_ACTION, 'text-emerald-700 active:bg-emerald-50')}
        >
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> Contratar
        </Link>
      ) : (
        <span className="flex-1" />
      )}
      <button
        type="button"
        onClick={() => onOpenMenu(application)}
        aria-label={`Acciones de ${application.candidatoNombre}`}
        className="flex min-h-11 w-12 shrink-0 items-center justify-center border-l border-slate-100 text-slate-500 outline-none transition focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500/60 active:bg-slate-100"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}
