'use client'

import { cn } from '@/lib/utils/cn'
import { INPUT } from '@/components/ui/styles'
import { SelectMenu } from '@/components/ui/SelectMenu'

// Clases propias del trigger (no el default de SelectMenu): fondo celeste
// tenue y texto de marca en negrita, mas angosto que un select comun porque
// solo tiene que caber "a.m."/"p.m.". Via `triggerClassName`, que REEMPLAZA
// las clases default en vez de mezclarse — `cn()` en este proyecto no
// resuelve conflictos de color, asi que apilar un bg propio sobre el
// `bg-white` default dejaria dos clases de fondo compitiendo.
const AM_PM_TRIGGER =
  'flex items-center justify-between gap-1 rounded-xl border border-slate-200 bg-slate-50 py-2 pl-2.5 pr-1.5 text-xs font-bold text-brand-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-brand-600 focus:ring-4 focus:ring-brand-600/10 pointer-coarse:min-h-11'

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
      <SelectMenu
        value={meridiemOf(value)}
        onChange={(v) => onChange(withMeridiem(value, v as 'AM' | 'PM'))}
        ariaLabel="a.m. o p.m."
        className="w-auto"
        triggerClassName={AM_PM_TRIGGER}
        options={[
          { value: 'AM', label: 'a.m.' },
          { value: 'PM', label: 'p.m.' },
        ]}
      />
    </div>
  )
}
