'use client'

import { cn } from '@/lib/utils/cn'
import { INPUT } from '@/components/ui/styles'

// Flecha propia, mas chica que SELECT_ARROW: ese token trae su padding
// horneado (pr-9) para un select de ancho libre, y `cn` de este proyecto no
// hace merge de clases en conflicto — apilarle un pr-7 encima no garantiza
// cual gana. Con solo "a.m." / "p.m." de contenido, pr-9 se ve con aire de
// mas; esta version usa un icono mas chico con su propio padding a juego.
const AM_PM_ARROW = `appearance-none bg-[length:0.85rem] bg-[right_0.35rem_center] bg-no-repeat pr-6 bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="%2394a3b8"%3E%3Cpath stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5"/%3E%3C/svg%3E')]`

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
        className={cn(
          AM_PM_ARROW,
          'rounded-xl border border-slate-200 bg-slate-50 py-2 pl-2.5 text-xs font-bold text-brand-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-brand-600 focus:ring-4 focus:ring-brand-600/10 pointer-coarse:min-h-11'
        )}
        aria-label="a.m. o p.m."
      >
        <option value="AM">a.m.</option>
        <option value="PM">p.m.</option>
      </select>
    </div>
  )
}
