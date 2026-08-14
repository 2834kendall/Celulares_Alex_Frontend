'use client'

import { cn } from '@/lib/utils/cn'
import { INPUT } from '@/components/ui/styles'

interface TimeSelectProps {
  /** Valor en formato 24h "HH:MM". */
  value: string
  onChange: (value: string) => void
}

function meridiemOf(time: string): 'AM' | 'PM' {
  return Number(time.split(':')[0]) >= 12 ? 'PM' : 'AM'
}

function withMeridiem(time: string, meridiem: 'AM' | 'PM') {
  const [hStr, mStr] = time.split(':')
  const hour12 = Number(hStr) % 12
  const h24 = meridiem === 'PM' ? hour12 + 12 : hour12
  return `${String(h24).padStart(2, '0')}:${mStr}`
}

/**
 * Hora en formato 24h con selector a.m./p.m. al lado.
 *
 * Estaba duplicado byte a byte en `attendance/` y `schedules/`.
 */
export function TimeSelect({ value, onChange }: TimeSelectProps) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="time"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(INPUT, 'font-semibold tabular-nums')}
        required
      />
      <select
        value={meridiemOf(value)}
        onChange={(event) => onChange(withMeridiem(value, event.target.value as 'AM' | 'PM'))}
        className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-xs font-bold text-blue-700 shadow-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10"
        aria-label="a.m. o p.m."
      >
        <option value="AM">a.m.</option>
        <option value="PM">p.m.</option>
      </select>
    </div>
  )
}
