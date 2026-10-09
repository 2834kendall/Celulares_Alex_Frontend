'use client'

import { useRef, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  EyeOff,
  GripVertical,
  Minus,
  Plus,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import {
  PANEL_BY_ID,
  PANEL_IDS,
  PANEL_SIZES,
  toPrefs,
  type PanelId,
  type PanelSize,
  type ResolvedPanel,
} from '@/modules/dashboard/lib/panels'
import { saveDashboardPrefs } from '@/modules/dashboard/lib/savePrefs'

/*
 * Columns each size takes. On a wide dashboard the grid has 6 columns; on a
 * medium one, 2 (the two larger sizes take the full row there); on a narrow
 * one everything stacks. Container queries, like the rest of the page.
 */
const SIZE_CLASS: Record<PanelSize, string> = {
  2: '@4xl:col-span-2',
  3: '@4xl:col-span-3',
  4: '@2xl:col-span-2 @4xl:col-span-4',
  6: '@2xl:col-span-2 @4xl:col-span-6',
}

const SIZE_LABEL: Record<PanelSize, string> = {
  2: 'Angosto',
  3: 'Medio',
  4: 'Ancho',
  6: 'Completo',
}

const CONTROL =
  'flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 transition duration-150 hover:bg-slate-100 hover:text-slate-900 active:scale-90 disabled:pointer-events-none disabled:opacity-30 pointer-coarse:h-10 pointer-coarse:w-10'

function move<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/**
 * The grid of panels, and the mode to personalize it: hide and show panels,
 * reorder them (dragging, or with the arrows — which is what works on touch
 * and with the keyboard) and change how wide each one is.
 *
 * The panels themselves arrive already rendered from the server (`nodes`),
 * only the visible ones: a hidden panel is not even queried. That is why
 * showing a panel that was not loaded goes through the server — once the
 * choice is saved, the page is rendered again with the new panel — and a
 * placeholder holds its place meanwhile. Everything else (order, size,
 * hiding) is applied here at once and only saved in the background: the page
 * is not rendered again for it.
 */
export function DashboardBoard({
  panels,
  nodes,
}: {
  /** Every panel this session can have, in the saved order, hidden ones included. */
  panels: ResolvedPanel[]
  /** Rendered panels, by id. Only the visible ones are there. */
  nodes: Partial<Record<PanelId, ReactNode>>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(panels)
  const [error, setError] = useState<string | null>(null)
  const [dragId, setDragId] = useState<PanelId | null>(null)
  const [isSaving, startSaving] = useTransition()
  const router = useRouter()
  /* What the drag has rearranged so far, to save it when the drag ends. */
  const draggedOrder = useRef<ResolvedPanel[] | null>(null)

  /* The server answered with the saved arrangement: it replaces the draft.
     (Adjusting state while rendering, instead of an effect: see React docs,
     "Storing information from previous renders".) */
  const [lastPanels, setLastPanels] = useState(panels)
  if (lastPanels !== panels) {
    setLastPanels(panels)
    setDraft(panels)
  }

  function save(next: ResolvedPanel[]) {
    setDraft(next)
    setError(null)
    const needsLoading = next.some((panel) => !panel.hidden && nodes[panel.id] === undefined)
    startSaving(async () => {
      const result = await saveDashboardPrefs(toPrefs(next))
      if (!result.ok) setError(result.error)
      else if (needsLoading) router.refresh()
    })
  }

  function update(id: PanelId, change: Partial<ResolvedPanel>) {
    save(draft.map((panel) => (panel.id === id ? { ...panel, ...change } : panel)))
  }

  /* Moves among the VISIBLE panels: stepping over a hidden one would look
     like the button did nothing. */
  function shift(id: PanelId, direction: -1 | 1) {
    const visibleIds = draft.filter((panel) => !panel.hidden).map((panel) => panel.id)
    const neighbor = visibleIds[visibleIds.indexOf(id) + direction]
    if (!neighbor) return

    const from = draft.findIndex((panel) => panel.id === id)
    const to = draft.findIndex((panel) => panel.id === neighbor)
    save(move(draft, from, to))
  }

  function resize(id: PanelId, direction: -1 | 1) {
    const panel = draft.find((candidate) => candidate.id === id)
    if (!panel) return
    const size = PANEL_SIZES[PANEL_SIZES.indexOf(panel.size) + direction]
    if (size) update(id, { size })
  }

  /* The registry order is the default order; sizes go back to each panel's own. */
  function reset() {
    save(
      [...draft]
        .sort((a, b) => PANEL_IDS.indexOf(a.id) - PANEL_IDS.indexOf(b.id))
        .map((panel) => ({
          ...panel,
          hidden: Boolean(PANEL_BY_ID[panel.id].defaultHidden),
          size: PANEL_BY_ID[panel.id].defaultSize,
        }))
    )
  }

  function dragOver(targetId: PanelId) {
    if (!dragId || dragId === targetId) return
    const from = draft.findIndex((panel) => panel.id === dragId)
    const to = draft.findIndex((panel) => panel.id === targetId)
    if (from < 0 || to < 0) return

    const next = move(draft, from, to)
    draggedOrder.current = next
    setDraft(next)
  }

  function dragEnd() {
    setDragId(null)
    if (draggedOrder.current) save(draggedOrder.current)
    draggedOrder.current = null
  }

  const visible = draft.filter((panel) => !panel.hidden)
  const hidden = draft.filter((panel) => panel.hidden)
  const defaultOrder = PANEL_IDS.filter((id) => draft.some((panel) => panel.id === id))
  const isDefault = draft.every(
    (panel, index) =>
      panel.hidden === Boolean(PANEL_BY_ID[panel.id].defaultHidden) &&
      panel.size === PANEL_BY_ID[panel.id].defaultSize &&
      panel.id === defaultOrder[index]
  )

  if (draft.length === 0) return null

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {editing && (
          <p className="mr-auto text-xs text-slate-500" aria-live="polite">
            {error ?? (isSaving ? 'Guardando…' : 'Arrastrá los paneles o usá sus controles.')}
          </p>
        )}
        {editing && !isDefault && (
          <button
            type="button"
            onClick={reset}
            className="group inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition duration-200 hover:bg-slate-100 hover:text-slate-900 active:scale-95 pointer-coarse:min-h-10"
          >
            <RotateCcw
              className="h-3.5 w-3.5 transition-transform duration-300 group-hover:-rotate-90"
              aria-hidden="true"
            />
            Restablecer
          </button>
        )}
        <button
          type="button"
          onClick={() => setEditing((current) => !current)}
          aria-pressed={editing}
          className={cn(
            'group inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition duration-200 active:scale-95 pointer-coarse:min-h-10',
            editing
              ? 'bg-brand-700 text-white shadow-sm hover:bg-brand-800'
              : 'text-brand-700 hover:bg-brand-50'
          )}
        >
          {editing ? (
            <>
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Listo
            </>
          ) : (
            <>
              <SlidersHorizontal
                className="h-3.5 w-3.5 transition-transform duration-200 group-hover:scale-110"
                aria-hidden="true"
              />
              Personalizar
            </>
          )}
        </button>
      </div>

      {editing && hidden.length > 0 && (
        <div className="dash-enter flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white/60 p-3">
          <span className="text-xs font-semibold text-slate-500">Ocultos</span>
          {hidden.map((panel) => (
            <button
              key={panel.id}
              type="button"
              title={panel.description}
              onClick={() => update(panel.id, { hidden: false })}
              className="group inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white py-1 pr-3 pl-2 text-xs font-semibold text-slate-700 transition duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:text-brand-700 hover:shadow-sm active:scale-95 pointer-coarse:min-h-10"
            >
              <Plus
                className="h-3.5 w-3.5 text-brand-600 transition-transform duration-200 group-hover:rotate-90"
                aria-hidden="true"
              />
              {panel.label}
            </button>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-6 text-center text-sm text-slate-500">
          Ocultaste todos los paneles. Tocá «Personalizar» para volver a mostrarlos.
        </p>
      ) : (
        <div className="grid gap-4 @2xl:grid-flow-row-dense @2xl:grid-cols-2 @4xl:grid-cols-6">
          {visible.map((panel, index) => {
            const node = nodes[panel.id]
            const sizeIndex = PANEL_SIZES.indexOf(panel.size)

            return (
              <div
                key={panel.id}
                className={cn(
                  'dash-slot relative min-w-0',
                  SIZE_CLASS[panel.size],
                  dragId === panel.id && 'opacity-40'
                )}
                data-editing={editing}
                draggable={editing}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'move'
                  setDragId(panel.id)
                }}
                onDragEnter={() => dragOver(panel.id)}
                onDragOver={(event) => {
                  if (dragId) event.preventDefault()
                }}
                onDragEnd={dragEnd}
              >
                {editing && (
                  <div
                    className="dash-enter absolute -top-3 left-1/2 z-10 flex max-w-[calc(100%-1rem)] -translate-x-1/2 items-center gap-0.5 rounded-xl border border-slate-200 bg-white p-0.5 shadow-md"
                    role="toolbar"
                    aria-label={`Controles de ${panel.label}`}
                  >
                    <span
                      className="hidden h-8 w-6 cursor-grab items-center justify-center text-slate-400 active:cursor-grabbing pointer-fine:flex"
                      aria-hidden="true"
                    >
                      <GripVertical className="h-4 w-4" />
                    </span>
                    <button
                      type="button"
                      className={CONTROL}
                      onClick={() => shift(panel.id, -1)}
                      disabled={index === 0}
                      aria-label={`Mover ${panel.label} antes`}
                    >
                      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={CONTROL}
                      onClick={() => shift(panel.id, 1)}
                      disabled={index === visible.length - 1}
                      aria-label={`Mover ${panel.label} después`}
                    >
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                    {/* Width only means something once the dashboard has columns:
                        stacked, every panel takes the full row. */}
                    <div className="hidden items-center gap-0.5 @2xl:flex">
                      <span className="mx-0.5 h-5 w-px bg-slate-200" aria-hidden="true" />
                      <button
                        type="button"
                        className={CONTROL}
                        onClick={() => resize(panel.id, -1)}
                        disabled={sizeIndex === 0}
                        aria-label={`Hacer ${panel.label} más angosto`}
                      >
                        <Minus className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <span className="hidden w-16 text-center text-[11px] font-semibold text-slate-600 @md:inline">
                        {SIZE_LABEL[panel.size]}
                      </span>
                      <button
                        type="button"
                        className={CONTROL}
                        onClick={() => resize(panel.id, 1)}
                        disabled={sizeIndex === PANEL_SIZES.length - 1}
                        aria-label={`Hacer ${panel.label} más ancho`}
                      >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                    <span className="mx-0.5 h-5 w-px bg-slate-200" aria-hidden="true" />
                    <button
                      type="button"
                      className={cn(CONTROL, 'hover:bg-rose-50 hover:text-rose-700')}
                      onClick={() => update(panel.id, { hidden: true })}
                      aria-label={`Ocultar ${panel.label}`}
                    >
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                )}

                {/* While personalizing, the panel is a block to arrange, not
                    something to operate: its own controls are switched off. */}
                <div className={cn('h-full [&>section]:h-full', editing && 'pointer-events-none')}>
                  {node ?? (
                    <div
                      className="flex h-full min-h-40 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/60 text-sm text-slate-500"
                      aria-busy="true"
                    >
                      Cargando {panel.label.toLowerCase()}…
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
