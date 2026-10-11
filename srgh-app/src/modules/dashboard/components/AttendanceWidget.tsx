'use client'

import { useState, type CSSProperties, type ReactNode } from 'react'
import {
  CalendarClock,
  CircleCheck,
  CircleX,
  Clock,
  FileCheck,
  Hourglass,
  type LucideIcon,
} from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { Avatar } from '@/components/ui/Avatar'
import { Hora } from '@/components/ui/Hora'
import { cn } from '@/lib/utils/cn'
import { DEFAULT_TARDINESS_COLOR } from '@/modules/attendance/lib/infractions'
import { formatMinutes } from '@/modules/attendance/lib/time'
import { CountUp } from '@/modules/dashboard/components/CountUp'
import { ClockSpot } from '@/modules/dashboard/components/Spots'
import { WidgetCard } from '@/modules/dashboard/components/WidgetCard'
import type { AttendanceSummary, TardinessTag } from '@/modules/dashboard/lib/summaries'

type SegmentKey = 'onTime' | 'late' | 'missing' | 'pending' | 'justified'

/*
 * Status colors, reserved for state (good / warning / critical) plus two
 * neutrals: a light one for "not due yet" and a darker one for "accounted
 * for, not coming". They never stand alone: every segment is also named,
 * with its icon and its count, in the tiles below — and the text there stays
 * in ink, never in the status color.
 *
 * These are the colors of the five buckets. WHICH tardiness someone is in is
 * a different thing and comes from the company's catalog, with its own name
 * and color: see the dot next to each person in the lists.
 */
const SEGMENTS: { key: SegmentKey; label: string; color: string; icon: LucideIcon }[] = [
  { key: 'onTime', label: 'A tiempo', color: '#0ca30c', icon: CircleCheck },
  { key: 'late', label: 'Tardía', color: '#fab219', icon: Clock },
  { key: 'missing', label: 'Sin marcar', color: '#d03b3b', icon: CircleX },
  { key: 'pending', label: 'Por llegar', color: '#cbd5e1', icon: Hourglass },
  { key: 'justified', label: 'Justificada', color: '#64748b', icon: FileCheck },
]

const PEOPLE_SHOWN = 4

/** Name and color of a tardiness type, exactly as the company configured it. */
function TardinessLabel({ tipo, children }: { tipo: TardinessTag; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: tipo.color ?? DEFAULT_TARDINESS_COLOR }}
        aria-hidden="true"
      />
      {tipo.nombre} · {children}
    </span>
  )
}

/** Short list of people under one of the day's states. */
function PeopleList({
  title,
  people,
}: {
  title: string
  people: { id: number; nombre: string; fotoUrl: string | null; detail: ReactNode }[]
}) {
  if (people.length === 0) return null
  const hidden = people.length - PEOPLE_SHOWN

  return (
    <div className="min-w-0">
      <h3 className="mb-1 px-2 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
        {title}
      </h3>
      <ul className="space-y-0.5">
        {people.slice(0, PEOPLE_SHOWN).map((person) => (
          <li
            key={person.id}
            className="dash-line group flex items-center gap-2 rounded-xl px-2 py-1 transition duration-200 hover:bg-slate-50"
          >
            <Avatar
              nombre={person.nombre}
              fotoUrl={person.fotoUrl}
              size="xs"
              className="transition-transform duration-300 group-hover:scale-110"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold text-slate-800">
                {person.nombre}
              </span>
              <span className="block truncate text-[11px] text-slate-500 tabular-nums">
                {person.detail}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {hidden > 0 && <p className="mt-1 px-2 text-[11px] text-slate-400">y {hidden} más</p>}
    </div>
  )
}

export function AttendanceWidget({
  summary,
  step,
  className,
}: {
  summary: AttendanceSummary
  step?: number
  className?: string
}) {
  /* Hovering a segment or its tile lights that part up in both. */
  const [active, setActive] = useState<SegmentKey | null>(null)
  const present = summary.onTime + summary.late
  const shown = SEGMENTS.filter((segment) => summary[segment.key] > 0)
  const hasLists =
    summary.latePeople.length > 0 ||
    summary.missingPeople.length > 0 ||
    summary.pendingPeople.length > 0

  return (
    <WidgetCard
      icon={CalendarClock}
      title="Asistencia de hoy"
      href="/attendance"
      step={step}
      className={className}
    >
      {summary.expected === 0 ? (
        <EmptyState
          size="sm"
          className="mt-4"
          icon={CalendarClock}
          title="Nadie tiene turno programado para hoy."
        />
      ) : (
        <>
          <div className="mt-4 flex items-center gap-3">
            <ClockSpot />
            <p className="min-w-0 text-sm text-slate-500">
              <span className="block text-3xl leading-none font-black tracking-tight text-slate-900">
                <CountUp value={present} />
                <span className="text-lg font-bold text-slate-400"> / {summary.expected}</span>
              </span>
              presentes
            </p>
            <dl className="ml-auto hidden shrink-0 gap-5 text-right @sm:flex">
              <div>
                <dt className="text-[11px] text-slate-500">En jornada</dt>
                <dd className="text-lg font-bold text-slate-900">
                  <CountUp value={summary.working} />
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-slate-500">Ya salieron</dt>
                <dd className="text-lg font-bold text-slate-900">
                  <CountUp value={summary.left} />
                </dd>
              </div>
            </dl>
          </div>

          {/* Part-to-whole of today's shift. 2px gaps between segments, and
              each one grows in from the left. */}
          <div
            className="mt-4 flex h-3.5 gap-0.5"
            role="img"
            aria-label={shown
              .map((segment) => `${segment.label}: ${summary[segment.key]}`)
              .join(', ')}
          >
            {shown.map((segment, index) => (
              <span
                key={segment.key}
                title={`${segment.label}: ${summary[segment.key]}`}
                onPointerEnter={() => setActive(segment.key)}
                onPointerLeave={() => setActive(null)}
                className={cn(
                  'dash-bar min-w-2 rounded-[4px] transition-[opacity,transform] duration-200',
                  active && active !== segment.key && 'opacity-30',
                  active === segment.key && 'scale-y-125'
                )}
                style={
                  {
                    flexGrow: summary[segment.key],
                    background: segment.color,
                    '--i': index,
                  } as CSSProperties
                }
              />
            ))}
          </div>

          <ul className="mt-3 mb-3 grid grid-cols-2 gap-2 @md:grid-cols-3 @2xl:grid-cols-5">
            {SEGMENTS.map(({ key, label, color, icon: Icon }) => (
              <li
                key={key}
                onPointerEnter={() => setActive(key)}
                onPointerLeave={() => setActive(null)}
                className={cn(
                  'dash-figure rounded-xl border p-2.5 transition duration-200',
                  active === key
                    ? '-translate-y-0.5 border-slate-300 bg-slate-50 shadow-sm'
                    : 'border-slate-100',
                  active && active !== key && 'opacity-50'
                )}
              >
                <span className="flex items-center gap-1.5 text-xs text-slate-600">
                  <Icon className="h-4 w-4 shrink-0" style={{ color }} aria-hidden="true" />
                  <span className="truncate">{label}</span>
                </span>
                <span className="mt-1 flex items-baseline gap-1.5">
                  <span className="dash-figure-value text-xl font-black text-slate-900 tabular-nums">
                    {summary[key]}
                  </span>
                  <span className="text-[11px] text-slate-400 tabular-nums">
                    {Math.round((summary[key] / summary.expected) * 100)}%
                  </span>
                </span>
              </li>
            ))}
          </ul>

          {hasLists && (
            <div className="mt-auto grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-x-4 gap-y-3 border-t border-slate-100 pt-3">
              <PeopleList
                title="Llegaron tarde"
                people={summary.latePeople.map((person) => ({
                  ...person,
                  detail: (
                    <TardinessLabel tipo={person.tipo}>
                      +{formatMinutes(person.minutes)}
                      {person.isJustified ? ' · justificada' : ''}
                    </TardinessLabel>
                  ),
                }))}
              />
              {/* Still without an entry mark. The type is the one of the
                  company's catalog they would get if they arrived right now. */}
              <PeopleList
                title="Sin marcar"
                people={summary.missingPeople.map((person) => ({
                  ...person,
                  detail: (
                    <TardinessLabel tipo={person.tipo}>
                      {formatMinutes(person.minutes)} de atraso
                    </TardinessLabel>
                  ),
                }))}
              />
              <PeopleList
                title="Por llegar"
                people={summary.pendingPeople.map((person) => ({
                  ...person,
                  detail: (
                    <>
                      Entra a las <Hora value={person.expectedStart} />
                    </>
                  ),
                }))}
              />
            </div>
          )}
        </>
      )}
    </WidgetCard>
  )
}
