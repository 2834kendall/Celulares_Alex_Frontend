'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { flushSync } from 'react-dom'
import Link from 'next/link'
import {
  Cake,
  Check,
  ChevronDown,
  Copy,
  Maximize2,
  Minimize2,
  PartyPopper,
  UserRound,
} from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { CARD } from '@/components/ui/styles'
import { cn } from '@/lib/utils/cn'
import { BirthdayCake } from '@/modules/dashboard/components/BirthdayCake'
import { ConfettiBurst } from '@/modules/dashboard/components/ConfettiBurst'
import { CountUp } from '@/modules/dashboard/components/CountUp'
import {
  MONTHS_LONG,
  MONTHS_SHORT,
  countdownLabel,
  type UpcomingBirthday,
} from '@/modules/dashboard/lib/birthdays'

type View = 'upcoming' | 'month'

const VIEWS: { key: View; label: string }[] = [
  { key: 'upcoming', label: 'Próximos' },
  { key: 'month', label: 'Por mes' },
]

/* Rows shown before "Ver todos" in the upcoming view. */
const COLLAPSED_ROWS = 5
/* Rows of the compact panel, before it is expanded. */
const COMPACT_ROWS = 2
/* The ring around the avatar starts filling this many days before. */
const RING_WINDOW_DAYS = 30
const PARTY_MS = 1700
const COPIED_MS = 1600

function firstName(nombre: string) {
  return nombre.trim().split(/\s+/)[0] ?? nombre
}

function enterStep(index: number) {
  return { '--i': index } as CSSProperties
}

export function BirthdaysPanel({
  birthdays,
  canSee,
  todayMonth,
  canOpenProfiles,
  step = 0,
  className,
}: {
  /** Sorted from the closest to the farthest. */
  birthdays: UpcomingBirthday[]
  /** false: the session cannot read employees (see getDashboardBirthdays). */
  canSee: boolean
  /** 1–12, of the day the countdowns were computed against. */
  todayMonth: number
  /** false for sample data: those people have no profile to open. */
  canOpenProfiles: boolean
  /** Position in the staggered entrance of the page (see `.dash-enter`). */
  step?: number
  className?: string
}) {
  /* Compact by default: one more panel among the others. Expanded, it takes
     the full row and brings the month view and the whole list. */
  const [expanded, setExpanded] = useState(false)
  const [view, setView] = useState<View>('upcoming')
  const [month, setMonth] = useState(todayMonth)
  const [showAll, setShowAll] = useState(false)
  const [openId, setOpenId] = useState<number | null>(null)
  const [congratulated, setCongratulated] = useState<ReadonlySet<number>>(new Set())
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [burst, setBurst] = useState(0)
  const [party, setParty] = useState(false)

  const sectionRef = useRef<HTMLElement>(null)
  const partyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const copiedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (partyTimeout.current) clearTimeout(partyTimeout.current)
      if (copiedTimeout.current) clearTimeout(copiedTimeout.current)
    },
    []
  )

  const perMonth = useMemo(() => {
    const counts = Array.from({ length: 12 }, () => 0)
    for (const birthday of birthdays) counts[birthday.month - 1] += 1
    return counts
  }, [birthdays])

  const today = birthdays.filter((birthday) => birthday.daysUntil === 0)

  /* The compact panel only has the upcoming view. */
  const activeView: View = expanded ? view : 'upcoming'
  const inView =
    activeView === 'upcoming'
      ? birthdays
      : birthdays.filter((b) => b.month === month).sort((a, b) => a.day - b.day)
  const rows = !expanded
    ? inView.slice(0, COMPACT_ROWS)
    : activeView === 'upcoming' && !showAll
      ? inView.slice(0, COLLAPSED_ROWS)
      : inView
  const hiddenCount = inView.length - rows.length

  function toggleExpanded() {
    /* Applied at once so the panel already has its new size when it is
       scrolled to: shrinking shortens the page, and without this the panel
       can end up above the viewport.

       This used to be a View Transition that morphed the panel between its
       two sizes. It was dropped for cost: the browser has to snapshot the
       whole page —every illustrated scene included— before and after, which
       made the change stutter, and the snapshot was painted over the sticky
       top bar. The content fading in (`dash-swap`) reads just as clearly. */
    flushSync(() => setExpanded((current) => !current))

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    sectionRef.current?.scrollIntoView({
      block: 'nearest',
      behavior: reducedMotion ? 'auto' : 'smooth',
    })
  }

  function celebrate() {
    setBurst((current) => current + 1)
    setParty(true)
    if (partyTimeout.current) clearTimeout(partyTimeout.current)
    partyTimeout.current = setTimeout(() => setParty(false), PARTY_MS)
  }

  function congratulate(id: number) {
    setCongratulated((current) => new Set(current).add(id))
    celebrate()
  }

  function copyMessage(birthday: UpcomingBirthday) {
    const message = `¡Feliz cumpleaños, ${firstName(birthday.nombre)}! Que tengas un gran día.`
    /* Clipboard needs a secure context and can be denied: the button simply
       does not confirm in that case. */
    void navigator.clipboard
      ?.writeText(message)
      .then(() => {
        setCopiedId(birthday.id)
        if (copiedTimeout.current) clearTimeout(copiedTimeout.current)
        copiedTimeout.current = setTimeout(() => setCopiedId(null), COPIED_MS)
      })
      .catch(() => {})
  }

  return (
    <section
      ref={sectionRef}
      className={cn(CARD, '@container dash-enter min-w-0 scroll-mt-20 p-4 @3xl:p-5', className)}
      /* Read by the board: an expanded panel takes the full row, whatever
         size its slot has (`.dash-slot:has(...)` in globals.css). */
      data-expanded={expanded}
      style={enterStep(step)}
    >
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-base font-extrabold tracking-tight text-slate-900">
          <span className="dash-icon-tilt flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <Cake className="h-4 w-4" aria-hidden="true" />
          </span>
          Cumpleaños
        </h2>

        {expanded && canSee && birthdays.length > 0 && (
          <div
            className="dash-enter relative ml-auto grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-xs font-semibold"
            role="tablist"
            aria-label="Vista de cumpleaños"
          >
            {/* The pill is one element that slides, not a background per tab:
                that is what makes the switch read as movement. */}
            <span
              aria-hidden="true"
              className={cn(
                'absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-lg bg-white shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.3,1.3,0.5,1)]',
                view === 'month' && 'translate-x-full'
              )}
            />
            {VIEWS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={view === key}
                onClick={() => {
                  setView(key)
                  setOpenId(null)
                }}
                className={cn(
                  'relative rounded-lg px-3.5 py-1.5 transition-colors duration-200 pointer-coarse:min-h-10',
                  view === key ? 'text-slate-900' : 'text-slate-500 hover:text-slate-700'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {canSee && birthdays.length > 0 && (
          <button
            type="button"
            onClick={toggleExpanded}
            aria-expanded={expanded}
            className={cn(
              'group inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-brand-700 transition duration-200 hover:bg-brand-50 active:scale-95 pointer-coarse:min-h-10',
              !expanded && 'ml-auto'
            )}
          >
            {expanded ? (
              <>
                <Minimize2
                  className="h-3.5 w-3.5 transition-transform duration-200 group-hover:scale-90"
                  aria-hidden="true"
                />
                Reducir
              </>
            ) : (
              <>
                <Maximize2
                  className="h-3.5 w-3.5 transition-transform duration-200 group-hover:scale-125"
                  aria-hidden="true"
                />
                Ver todos
              </>
            )}
          </button>
        )}
      </header>

      <div
        className={cn(
          'mt-4 grid gap-4',
          expanded && '@3xl:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] @3xl:gap-5'
        )}
      >
        <div
          className={cn(
            'relative rounded-2xl bg-brand-50',
            expanded ? 'h-44 @3xl:h-auto @3xl:min-h-64' : 'h-32'
          )}
        >
          <BirthdayCake party={party} />
          <ConfettiBurst burst={burst} />
        </div>

        <div key={String(expanded)} className="dash-swap min-w-0">
          {!canSee ? (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
              Tu rol no tiene acceso a la ficha de los colaboradores, así que los cumpleaños no se
              muestran aquí.
            </p>
          ) : birthdays.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
              Todavía no hay fechas de nacimiento cargadas en los expedientes.
            </p>
          ) : (
            <>
              {today.length > 0 && activeView === 'upcoming' && (
                <div className="dash-today mb-3 flex flex-wrap items-center gap-3 rounded-2xl p-3">
                  <div className="flex -space-x-2">
                    {today.slice(0, 3).map((birthday) => (
                      <Avatar
                        key={birthday.id}
                        nombre={birthday.nombre}
                        fotoUrl={birthday.fotoUrl}
                        className="ring-2 ring-white"
                      />
                    ))}
                  </div>
                  <p className="min-w-0 flex-1 text-sm font-semibold text-slate-900">
                    <span className="block text-[11px] font-semibold tracking-wide text-brand-700 uppercase">
                      Hoy
                    </span>
                    {today.map((birthday) => firstName(birthday.nombre)).join(', ')}{' '}
                    {today.length === 1 ? 'cumple años' : 'cumplen años'}
                  </p>
                  <button
                    type="button"
                    onClick={celebrate}
                    className="dash-celebrate group inline-flex items-center gap-1.5 rounded-xl bg-brand-700 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:bg-brand-800 hover:shadow-md active:translate-y-0 active:scale-95 pointer-coarse:min-h-11"
                  >
                    <PartyPopper
                      className="h-4 w-4 transition-transform duration-300 group-hover:-rotate-12 group-hover:scale-110"
                      aria-hidden="true"
                    />
                    Celebrar
                  </button>
                </div>
              )}

              {activeView === 'month' && (
                <div
                  className="mb-3 grid grid-cols-4 gap-1.5 @sm:grid-cols-6 @2xl:grid-cols-12"
                  role="group"
                  aria-label="Mes"
                >
                  {MONTHS_SHORT.map((label, index) => {
                    const value = index + 1
                    const selected = value === month
                    return (
                      <button
                        key={label}
                        type="button"
                        aria-pressed={selected}
                        aria-label={`${MONTHS_LONG[index]}: ${perMonth[index]} cumpleaños`}
                        onClick={() => {
                          setMonth(value)
                          setOpenId(null)
                        }}
                        className={cn(
                          'dash-enter dash-month group relative flex flex-col items-center rounded-xl border px-1 py-1.5 text-[11px] font-semibold capitalize transition duration-200 hover:-translate-y-0.5 active:scale-95 pointer-coarse:min-h-11',
                          selected
                            ? 'border-brand-600 bg-brand-600 text-white shadow-sm'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:text-brand-700'
                        )}
                        style={enterStep(index * 0.4)}
                      >
                        {label}
                        <span
                          className={cn(
                            'mt-0.5 text-[10px] tabular-nums',
                            selected ? 'text-white/80' : 'text-slate-400'
                          )}
                        >
                          {perMonth[index]}
                        </span>
                        {value === todayMonth && (
                          <span
                            aria-hidden="true"
                            className={cn(
                              'absolute top-1 right-1 h-1.5 w-1.5 rounded-full',
                              selected ? 'bg-white' : 'bg-brand-500'
                            )}
                          />
                        )}
                      </button>
                    )
                  })}
                </div>
              )}

              {rows.length === 0 ? (
                <p className="dash-enter rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                  Nadie cumple años en {MONTHS_LONG[month - 1]}.
                </p>
              ) : (
                /* Keyed by the filter: switching it replays the staggered
                   entrance of the rows. */
                <ul key={`${expanded}-${activeView}-${month}-${showAll}`} className="space-y-2">
                  {rows.map((birthday, index) => {
                    const isOpen = openId === birthday.id
                    const isToday = birthday.daysUntil === 0
                    const wasCongratulated = congratulated.has(birthday.id)
                    const closeness =
                      1 - Math.min(birthday.daysUntil, RING_WINDOW_DAYS) / RING_WINDOW_DAYS

                    return (
                      <li key={birthday.id} className="dash-enter" style={enterStep(index)}>
                        <div
                          className={cn(
                            'dash-row group rounded-2xl border bg-white transition duration-200',
                            isOpen
                              ? 'border-brand-300 shadow-[0_6px_20px_-10px_rgba(15,23,42,0.25)]'
                              : 'border-slate-200 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-[0_6px_16px_-10px_rgba(15,23,42,0.25)]'
                          )}
                        >
                          <button
                            type="button"
                            aria-expanded={isOpen}
                            onClick={() => setOpenId(isOpen ? null : birthday.id)}
                            className="flex w-full items-center gap-3 rounded-2xl p-2.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                          >
                            <span className="relative flex h-12 w-12 shrink-0 items-center justify-center">
                              <svg
                                viewBox="0 0 48 48"
                                className="absolute inset-0 h-full w-full -rotate-90"
                                aria-hidden="true"
                              >
                                <circle
                                  cx={24}
                                  cy={24}
                                  r={22}
                                  fill="none"
                                  className="stroke-slate-100"
                                  strokeWidth={3}
                                />
                                <circle
                                  cx={24}
                                  cy={24}
                                  r={22}
                                  fill="none"
                                  pathLength={100}
                                  className="dash-ring stroke-brand-500"
                                  strokeWidth={3}
                                  strokeLinecap="round"
                                  style={{ '--ring': Math.round(closeness * 100) } as CSSProperties}
                                />
                              </svg>
                              <Avatar
                                nombre={birthday.nombre}
                                fotoUrl={birthday.fotoUrl}
                                className="transition-transform duration-300 group-hover:scale-105"
                              />
                            </span>

                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-slate-900">
                                {birthday.nombre}
                              </span>
                              <span className="block truncate text-xs text-slate-500">
                                {[birthday.puesto, birthday.sucursal].filter(Boolean).join(' · ') ||
                                  'Sin puesto asignado'}
                              </span>
                            </span>

                            <span className="hidden shrink-0 text-right @md:block">
                              <span className="block text-sm font-bold text-slate-900 tabular-nums">
                                {birthday.dateLabel}
                              </span>
                              <span className="block text-[11px] text-slate-400 capitalize">
                                {birthday.weekday}
                              </span>
                            </span>

                            <span
                              className={cn(
                                'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold whitespace-nowrap',
                                isToday
                                  ? 'dash-pulse bg-brand-600 text-white'
                                  : birthday.daysUntil <= 7
                                    ? 'bg-brand-50 text-brand-700'
                                    : 'bg-slate-100 text-slate-600'
                              )}
                            >
                              {birthday.daysUntil > 1 ? (
                                <>
                                  en <CountUp value={birthday.daysUntil} /> días
                                </>
                              ) : (
                                countdownLabel(birthday.daysUntil)
                              )}
                            </span>

                            <ChevronDown
                              className={cn(
                                'h-4 w-4 shrink-0 text-slate-400 transition-transform duration-300',
                                isOpen && 'rotate-180 text-brand-600'
                              )}
                              aria-hidden="true"
                            />
                          </button>

                          {/* Grid rows 0fr → 1fr: animates to the real height
                              of the content without measuring it. */}
                          <div className="dash-collapse" data-open={isOpen}>
                            <div className="overflow-hidden">
                              <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 p-2.5">
                                <span className="mr-auto text-xs text-slate-500 @md:hidden">
                                  {birthday.dateLabel} ·{' '}
                                  <span className="capitalize">{birthday.weekday}</span>
                                </span>
                                <button
                                  type="button"
                                  tabIndex={isOpen ? 0 : -1}
                                  onClick={() => congratulate(birthday.id)}
                                  className={cn(
                                    'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition duration-200 active:scale-95 pointer-coarse:min-h-10',
                                    wasCongratulated
                                      ? 'bg-emerald-50 text-emerald-700'
                                      : 'bg-brand-700 text-white hover:-translate-y-0.5 hover:bg-brand-800'
                                  )}
                                >
                                  {wasCongratulated ? (
                                    <>
                                      <Check className="dash-pop h-3.5 w-3.5" aria-hidden="true" />
                                      Felicitado
                                    </>
                                  ) : (
                                    <>
                                      <PartyPopper className="h-3.5 w-3.5" aria-hidden="true" />
                                      Felicitar
                                    </>
                                  )}
                                </button>
                                <button
                                  type="button"
                                  tabIndex={isOpen ? 0 : -1}
                                  onClick={() => copyMessage(birthday)}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 active:scale-95 pointer-coarse:min-h-10"
                                >
                                  {copiedId === birthday.id ? (
                                    <>
                                      <Check
                                        className="dash-pop h-3.5 w-3.5 text-emerald-600"
                                        aria-hidden="true"
                                      />
                                      Copiado
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                                      Copiar mensaje
                                    </>
                                  )}
                                </button>
                                {canOpenProfiles && (
                                  <Link
                                    href={`/employees/${birthday.id}`}
                                    tabIndex={isOpen ? 0 : -1}
                                    className="group/link inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 active:scale-95 pointer-coarse:min-h-10"
                                  >
                                    <UserRound
                                      className="h-3.5 w-3.5 transition-transform duration-200 group-hover/link:scale-110"
                                      aria-hidden="true"
                                    />
                                    Ver perfil
                                  </Link>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}

              {expanded && activeView === 'upcoming' && (hiddenCount > 0 || showAll) && (
                <button
                  type="button"
                  onClick={() => setShowAll((current) => !current)}
                  className="group mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 transition hover:text-brand-800"
                >
                  {showAll ? 'Ver menos' : `Ver todos (${inView.length})`}
                  <ChevronDown
                    className={cn(
                      'h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-y-0.5',
                      showAll && 'rotate-180 group-hover:-translate-y-0.5'
                    )}
                    aria-hidden="true"
                  />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  )
}
