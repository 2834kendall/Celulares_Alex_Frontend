import { CalendarCheck2, CalendarX2, Clock } from 'lucide-react'
import type { JustificationItem } from '@/modules/attendance/lib/pendingJustifications'
import { tardinessChipStyle } from '@/modules/attendance/components/tardinessChip'
import { formatMinutes } from '@/modules/attendance/lib/time'

const PILL = 'rounded-full px-2 py-0.5 text-[11px] font-semibold'

function dayParts(dateISO: string) {
  const date = new Date(`${dateISO}T00:00:00`)
  const weekday = new Intl.DateTimeFormat('es-CR', { weekday: 'short' }).format(date)
  return { day: date.getDate(), weekday: weekday.replace('.', '') }
}

interface IncidentRowProps {
  item: JustificationItem
  /** En la bandeja se mezclan colaboradores: ahi hace falta el nombre. */
  showName?: boolean
  /** Boton a la derecha (Justificar / Ver motivo), si corresponde. */
  action?: React.ReactNode
}

/**
 * Un dia con una tardia o una ausencia, como tarjeta: fecha grande a la
 * izquierda, que paso en el medio y la accion a la derecha. Lo comparten el
 * detalle del resumen mensual y la bandeja "Por justificar", para que el
 * mismo dia se lea igual en los dos lugares.
 */
export function IncidentRow({ item, showName = false, action }: IncidentRowProps) {
  const { day, weekday } = dayParts(item.date)

  let icon = <CalendarX2 className="h-4 w-4 text-rose-600" aria-hidden="true" />
  let title: React.ReactNode
  let tags: React.ReactNode

  if (item.kind === 'tardia') {
    const d = item.day
    icon = <Clock className="h-4 w-4 text-amber-600" aria-hidden="true" />
    title = (
      <>
        {d.kind === 'entrada' ? 'Llego a las ' : 'Volvio del almuerzo a las '}
        <span className="tabular-nums">{d.time}</span>
        <span className="font-normal text-slate-500"> · +{formatMinutes(d.diffMinutes)}</span>
      </>
    )
    tags = (
      <>
        <span style={tardinessChipStyle(d.tipo.color)} className={PILL}>
          {d.tipo.nombre}
        </span>
        {/* Un tipo configurado para no contar: se ve, pero hay que decir que
            no suma, o el conteo del mes parece no cuadrar con la lista. */}
        {!d.isJustified && !d.countsTowardWarning && (
          <span className={`${PILL} bg-slate-100 text-slate-500`}>No suma</span>
        )}
        {d.isJustified && (
          <span
            className={`${PILL} bg-emerald-50 text-emerald-700`}
            title={d.justification ?? undefined}
          >
            Justificada
          </span>
        )}
      </>
    )
  } else if (item.kind === 'ausencia') {
    title = 'No vino y no marco'
    tags = <span className={`${PILL} bg-rose-50 text-rose-700`}>Ausencia</span>
  } else {
    icon = <CalendarCheck2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
    title = item.tipoNombre
    tags = <span className={`${PILL} bg-emerald-50 text-emerald-700`}>Ausencia justificada</span>
  }

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-white px-3 py-2.5 ring-1 ring-slate-200/70">
      <span className="flex w-10 shrink-0 flex-col items-center leading-none">
        <span className="text-[10px] font-semibold uppercase text-slate-400">{weekday}</span>
        <span className="mt-0.5 text-lg font-bold tabular-nums text-slate-800">{day}</span>
      </span>
      <span className="flex min-w-0 flex-1 basis-40 items-start gap-2">
        <span className="mt-0.5 shrink-0">{icon}</span>
        <span className="min-w-0">
          {showName && (
            <span className="block truncate text-sm font-semibold text-slate-900">
              {item.employeeName}
            </span>
          )}
          <span
            className={`block ${showName ? 'text-xs text-slate-600' : 'text-sm font-medium text-slate-800'}`}
          >
            {title}
          </span>
          <span className="mt-1 flex flex-wrap gap-1.5">{tags}</span>
        </span>
      </span>
      {action && <span className="ml-auto shrink-0">{action}</span>}
    </li>
  )
}
