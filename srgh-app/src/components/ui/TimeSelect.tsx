'use client'

import { useController, type Control, type FieldValues, type Path } from 'react-hook-form'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { useFormatoHora } from '@/lib/time/FormatoHoraContext'

// Clases propias del trigger (no el default de SelectMenu): fondo celeste
// tenue y texto de marca en negrita, mas angosto que un select comun porque
// solo tiene que caber "a. m."/"p. m.". Via `triggerClassName`, que REEMPLAZA
// las clases default en vez de mezclarse — `cn()` en este proyecto no
// resuelve conflictos de color, asi que apilar un bg propio sobre el
// `bg-white` default dejaria dos clases de fondo compitiendo.
const AM_PM_TRIGGER =
  'flex items-center justify-between gap-1 rounded-xl border border-slate-200 bg-slate-50 py-2 pl-2.5 pr-1.5 text-xs font-bold whitespace-nowrap text-brand-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-brand-600 focus:ring-4 focus:ring-brand-600/10 disabled:cursor-not-allowed disabled:text-slate-400 pointer-coarse:min-h-11'

const pad = (n: number) => String(n).padStart(2, '0')

const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, m) => ({ value: pad(m), label: pad(m) }))
const HOUR_OPTIONS_24 = Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: pad(h) }))
// 1..12, como el reloj: el 12 va al final y no arriba del 1.
const HOUR_OPTIONS_12 = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: String(i + 1),
}))
const MERIDIEM_OPTIONS = [
  { value: 'AM', label: 'a. m.' },
  { value: 'PM', label: 'p. m.' },
]

type Meridiem = 'AM' | 'PM'

interface Parts {
  /** 0-23, o null si el valor esta vacio o mal formado. */
  hour: number | null
  minute: number | null
}

function parse(value: string): Parts {
  const match = /^(\d{1,2}):(\d{2})/.exec(value)
  if (!match) return { hour: null, minute: null }
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return { hour: null, minute: null }
  return { hour, minute }
}

function toValue(hour: number, minute: number): string {
  return `${pad(hour)}:${pad(minute)}`
}

export function meridiemOf(hour: number): Meridiem {
  return hour >= 12 ? 'PM' : 'AM'
}

/** 0→12, 13→1: la hora que se ve en el reloj de 12 horas. */
export function toHour12(hour: number): number {
  return hour % 12 || 12
}

/** Hora de 12h + a. m./p. m. → 0-23. 12 a. m. es medianoche, 12 p. m. mediodia. */
export function toHour24(hour12: number, meridiem: Meridiem): number {
  return (hour12 % 12) + (meridiem === 'PM' ? 12 : 0)
}

interface TimeSelectProps {
  /** Valor en formato 24h "HH:MM" — siempre, sin importar como se muestre. */
  value: string
  /** Devuelve siempre "HH:MM" en 24h. */
  onChange: (value: string) => void
  /**
   * Nombre del campo ("Hora de entrada"). Se usa para nombrar cada uno de
   * los selectores ante lectores de pantalla y en las pruebas: un
   * `<label htmlFor>` no alcanza porque el control son dos o tres botones.
   */
  label: string
  /** Va al selector de la hora, para que un `<label htmlFor>` lo enfoque. */
  id?: string
  disabled?: boolean
  invalid?: boolean
}

/**
 * Selector de hora que respeta el formato 12/24h de Configuración.
 *
 * Reemplaza al `<input type="time">` nativo, que dibuja el navegador segun
 * el idioma del SISTEMA OPERATIVO (en un Windows en ingles salia "AM/PM" y
 * en otro equipo 24h) y no hay forma de forzarlo desde la pagina. Aca son
 * selectores propios: hora + minutos, y a. m./p. m. solo en formato 12h.
 *
 * El contrato hacia afuera no cambia con el formato: entra y sale "HH:MM"
 * en 24h, que es lo que guardan la base, los esquemas zod y la logica de
 * asistencia. El formato es solo lo que ve la persona.
 */
export function TimeSelect({
  value,
  onChange,
  label,
  id,
  disabled = false,
  invalid = false,
}: TimeSelectProps) {
  const formato = useFormatoHora()
  const { hour, minute } = parse(value)
  const is12h = formato === '12h'

  // Un valor vacio (break recien activado, campo opcional) se completa con
  // lo que falte al elegir la primera parte: hora → HH:00, minutos → 00:MM
  // (en 12h, "12 a. m."). Nunca se emite un valor a medias.
  const currentHour = hour ?? 0
  const currentMinute = minute ?? 0

  function onHourChange(v: string) {
    const picked = Number(v)
    const next = is12h ? toHour24(picked, meridiemOf(currentHour)) : picked
    onChange(toValue(next, currentMinute))
  }

  function onMinuteChange(v: string) {
    onChange(toValue(currentHour, Number(v)))
  }

  function onMeridiemChange(v: string) {
    onChange(toValue(toHour24(toHour12(currentHour), v as Meridiem), currentMinute))
  }

  const hourValue = hour === null ? '' : String(is12h ? toHour12(hour) : hour)

  return (
    <div className="flex items-center gap-1.5">
      <SelectMenu
        id={id}
        ariaLabel={`${label}: hora`}
        value={hourValue}
        onChange={onHourChange}
        options={is12h ? HOUR_OPTIONS_12 : HOUR_OPTIONS_24}
        placeholder="--"
        disabled={disabled}
        invalid={invalid}
        className="min-w-0 flex-1"
      />
      <span className="text-sm font-bold text-slate-400" aria-hidden="true">
        :
      </span>
      <SelectMenu
        ariaLabel={`${label}: minutos`}
        value={minute === null ? '' : pad(minute)}
        onChange={onMinuteChange}
        options={MINUTE_OPTIONS}
        placeholder="--"
        disabled={disabled}
        invalid={invalid}
        className="min-w-0 flex-1"
      />
      {is12h && (
        <SelectMenu
          ariaLabel={`${label}: a. m. o p. m.`}
          value={hour === null ? '' : meridiemOf(hour)}
          onChange={onMeridiemChange}
          options={MERIDIEM_OPTIONS}
          placeholder="--"
          disabled={disabled}
          className="shrink-0"
          triggerClassName={AM_PM_TRIGGER}
        />
      )}
    </div>
  )
}

interface ControlledTimeSelectProps<T extends FieldValues> extends Omit<
  TimeSelectProps,
  'value' | 'onChange'
> {
  control: Control<T>
  name: Path<T>
}

/**
 * Puente entre React Hook Form y TimeSelect (mismo criterio que
 * ControlledSelectMenu: `register()` necesita un input nativo).
 */
export function ControlledTimeSelect<T extends FieldValues>({
  control,
  name,
  ...rest
}: ControlledTimeSelectProps<T>) {
  const {
    field: { value, onChange },
  } = useController({ name, control })

  return <TimeSelect {...rest} value={typeof value === 'string' ? value : ''} onChange={onChange} />
}
