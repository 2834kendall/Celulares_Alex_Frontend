import {
  CalendarMinus,
  CalendarOff,
  CircleCheck,
  CircleX,
  FileCheck,
  Hourglass,
  LogIn,
  LogOut,
  type LucideIcon,
} from 'lucide-react'
import { Badge, type BadgeSize, type BadgeTone } from '@/components/ui/Badge'
import type { DayStatus, DayStatusKind } from '@/modules/attendance/lib/dayStatus'
import { formatMinutes } from '@/modules/attendance/lib/time'
import { tardinessChipStyle } from './tardinessChip'

const STATUS_DISPLAY: Record<DayStatusKind, { label: string; icon: LucideIcon; tone: BadgeTone }> =
  {
    sin_marcar: { label: 'Sin marcar', icon: CircleX, tone: 'rose' },
    sin_salida: { label: 'Sin salida', icon: LogOut, tone: 'orange' },
    en_jornada: { label: 'En jornada', icon: LogIn, tone: 'emerald' },
    ya_salio: { label: 'Ya salió', icon: CircleCheck, tone: 'slate' },
    por_llegar: { label: 'Por llegar', icon: Hourglass, tone: 'slate' },
    justificada: { label: 'Justificada', icon: FileCheck, tone: 'blue' },
    libre: { label: 'Libre', icon: CalendarOff, tone: 'slate' },
    sin_programacion: { label: 'Sin horario', icon: CalendarMinus, tone: 'slate' },
  }

interface DayStatusBadgeProps {
  status: DayStatus
  size?: BadgeSize
  isHoliday?: boolean
}

export function DayStatusBadge({ status, size = 'sm', isHoliday = false }: DayStatusBadgeProps) {
  const { label, icon: Icon, tone } = STATUS_DISPLAY[status.kind]
  const { tardiness } = status

  return (
    <span className="inline-flex min-w-0 max-w-full flex-wrap items-center gap-1">
      <Badge size={size} tone={tone}>
        <Icon className="size-3 shrink-0" aria-hidden="true" />
        {status.kind === 'libre' && isHoliday ? 'Feriado' : label}
      </Badge>
      {tardiness && (
        <span
          style={tardiness.isJustified ? undefined : tardinessChipStyle(tardiness.color)}
          className={`max-w-full rounded-full px-2 py-0.5 font-semibold wrap-anywhere ${
            size === 'xs' ? 'text-[10px]' : 'text-[11px]'
          } ${tardiness.isJustified ? 'bg-slate-100 text-slate-500 ring-1 ring-slate-200 ring-inset' : ''}`}
        >
          {tardiness.nombre} · +{formatMinutes(tardiness.minutes)}
          {tardiness.isJustified ? ' · justificada' : ''}
        </span>
      )}
    </span>
  )
}
