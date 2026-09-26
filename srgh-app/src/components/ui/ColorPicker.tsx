'use client'

import { useState, type MouseEvent } from 'react'
import { Check, Plus, X } from 'lucide-react'
import { LABEL } from '@/components/ui/styles'

const HEX_RE = /^#[0-9a-f]{6}$/i

/** Pastel: la misma banda de saturacion/luminosidad para las 8, asi el set se lee como uno solo. */
const PASTEL_PRESETS = [
  '#AEE1F9', // azul cielo
  '#B8E8D0', // menta
  '#FBD3B9', // durazno
  '#FCEFA8', // amarillo claro
  '#A9E4E4', // aqua
  '#E8DCC0', // arena
  '#D8CFF2', // lavanda
  '#F6CDDA', // rosa
]

const MAX_CUSTOM = 16

function loadCustomColors(storageKey: string): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((color): color is string => typeof color === 'string' && HEX_RE.test(color))
      : []
  } catch {
    return []
  }
}

function saveCustomColors(storageKey: string, colors: string[]) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(colors))
  } catch {
    // Modo privado o cuota llena: perder la lista guardada no debe romper el formulario.
  }
}

interface ColorPickerProps {
  value: string | null | undefined
  onChange: (value: string | null) => void
  disabled?: boolean
  /** Etiqueta del campo ("Color de la plantilla", "Color del criterio"…). */
  label: string
  /** Bajada que explica para qué sirve el color en ESE contexto. */
  description?: string
  /** Texto del swatch vacío. Por defecto "Automatico". */
  emptyLabel?: string
  /**
   * Clave de localStorage donde viven los colores a medida del usuario. Cada
   * catálogo usa la suya para que las paletas no se pisen entre módulos.
   */
  storageKey: string
}

/**
 * 8 pastel fijos + los que el usuario vaya agregando con la ruedita nativa,
 * persistidos en localStorage para que sigan apareciendo la próxima vez que
 * cree o edite. `null` = sin color propio; cada módulo decide qué significa
 * eso (Horarios asigna uno automático por hor_id).
 *
 * Nació como ScheduleColorPicker dentro de `modules/schedules`; se promovió
 * acá al necesitarlo también el catálogo de criterios de selección
 * (SGRH-61). Lo único que cambia entre usos son los textos y la clave de
 * almacenamiento.
 */
export function ColorPicker({
  value,
  onChange,
  disabled,
  label,
  description,
  emptyLabel = 'Automatico',
  storageKey,
}: ColorPickerProps) {
  const [customColors, setCustomColors] = useState<string[]>(() => loadCustomColors(storageKey))

  // Si el horario editado ya trae un color a medida que no esta en los
  // presets ni en la lista guardada (p.ej. elegido desde otra computadora),
  // se suma una sola vez a lo guardado para que aparezca marcado en vez de
  // "perdido" — ajuste de estado durante el render (no en un efecto) para
  // que quede en localStorage de inmediato, sin depender de que el usuario
  // vuelva a tocar el color.
  const [lastMergedValue, setLastMergedValue] = useState<string | null>(null)
  if (value && HEX_RE.test(value)) {
    const normalized = value.toLowerCase()
    if (normalized !== lastMergedValue) {
      setLastMergedValue(normalized)
      const isKnown =
        PASTEL_PRESETS.some((preset) => preset.toLowerCase() === normalized) ||
        customColors.some((color) => color.toLowerCase() === normalized)
      if (!isKnown) {
        const next = [normalized, ...customColors].slice(0, MAX_CUSTOM)
        saveCustomColors(storageKey, next)
        setCustomColors(next)
      }
    }
  }

  function addCustomColor(hex: string) {
    const normalized = hex.toLowerCase()
    const next = [
      normalized,
      ...customColors.filter((color) => color.toLowerCase() !== normalized),
    ].slice(0, MAX_CUSTOM)
    saveCustomColors(storageKey, next)
    setCustomColors(next)
    onChange(normalized)
  }

  function removeCustomColor(hex: string, event: MouseEvent) {
    event.stopPropagation()
    event.preventDefault()
    const next = customColors.filter((color) => color.toLowerCase() !== hex.toLowerCase())
    saveCustomColors(storageKey, next)
    setCustomColors(next)
    if (value?.toLowerCase() === hex.toLowerCase()) onChange(null)
  }

  return (
    <div>
      <label className={LABEL}>{label}</label>
      {description && <p className="mb-2 text-[11px] text-slate-500">{description}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Swatch
          selected={!value}
          disabled={disabled}
          label={emptyLabel}
          onClick={() => onChange(null)}
          dashed
        />

        {PASTEL_PRESETS.map((preset) => (
          <Swatch
            key={preset}
            selected={value?.toLowerCase() === preset.toLowerCase()}
            disabled={disabled}
            label={`Usar ${preset}`}
            color={preset}
            onClick={() => onChange(preset)}
          />
        ))}

        {customColors.map((color) => (
          <div key={color} className="group relative">
            <Swatch
              selected={value?.toLowerCase() === color.toLowerCase()}
              disabled={disabled}
              label={`Usar ${color}`}
              color={color}
              onClick={() => onChange(color)}
            />
            <button
              type="button"
              aria-label={`Quitar ${color}`}
              onClick={(event) => removeCustomColor(color, event)}
              disabled={disabled}
              className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white bg-slate-400 text-white opacity-0 transition group-hover:opacity-100 hover:bg-rose-500 disabled:hidden"
            >
              <X className="h-2 w-2" />
            </button>
          </div>
        ))}

        <label
          className={`relative flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full border border-dashed border-slate-300 bg-white text-slate-400 transition hover:border-brand-400 hover:text-brand-600 ${
            disabled ? 'pointer-events-none opacity-50' : ''
          }`}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="sr-only">Agregar color personalizado</span>
          <input
            type="color"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            disabled={disabled}
            onChange={(event) => addCustomColor(event.target.value)}
          />
        </label>
      </div>
    </div>
  )
}

interface SwatchProps {
  selected: boolean
  disabled?: boolean
  label: string
  color?: string
  dashed?: boolean
  onClick: () => void
}

function Swatch({ selected, disabled, label, color, dashed, onClick }: SwatchProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      style={color ? { backgroundColor: color } : undefined}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-50 ${
        dashed ? 'border-dashed border-slate-300 bg-white' : 'border-black/10'
      } ${selected ? 'ring-2 ring-slate-400 ring-offset-1' : 'hover:border-slate-300'}`}
    >
      {selected && <Check className="h-3.5 w-3.5 text-slate-700" strokeWidth={3} />}
    </button>
  )
}
