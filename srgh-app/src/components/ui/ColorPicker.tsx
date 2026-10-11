'use client'

import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
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

        <CustomColorPopover disabled={disabled} onAdd={addCustomColor} />
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

type Hsv = { h: number; s: number; v: number }

function hexToHsv(hex: string): Hsv {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  let h = 0
  if (d) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h = (h * 60 + 360) % 360
  }
  return { h, s: max ? d / max : 0, v: max }
}

function hsvToHex({ h, s, v }: Hsv): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1))
  }
  return `#${[f(5), f(3), f(1)]
    .map((c) =>
      Math.round(c * 255)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`
}

// Selector propio (no el <input type="color"> nativo) para que se vea y se comporte igual en Mac y Windows.
function CustomColorPopover({
  disabled,
  onAdd,
}: {
  disabled?: boolean
  onAdd: (hex: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv('#7c9cf2'))
  const [hexText, setHexText] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const areaRef = useRef<HTMLDivElement>(null)
  const hex = hsvToHex(hsv)

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: globalThis.PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function moveInArea(event: PointerEvent<HTMLDivElement>) {
    const rect = areaRef.current?.getBoundingClientRect()
    if (!rect) return
    const s = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
    const v = 1 - Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
    setHexText(null)
    setHsv((prev) => ({ ...prev, s, v }))
  }

  function commitHexText(text: string) {
    const candidate = text.startsWith('#') ? text : `#${text}`
    if (HEX_RE.test(candidate)) setHsv(hexToHsv(candidate))
    setHexText(null)
  }

  function add() {
    onAdd(hex)
    setOpen(false)
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="Agregar color personalizado"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-dashed border-slate-300 bg-white text-slate-400 transition hover:border-brand-400 hover:text-brand-600 disabled:pointer-events-none disabled:opacity-50"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute left-0 top-9 z-30 w-56 space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
          <div
            ref={areaRef}
            className="relative h-32 w-full cursor-crosshair touch-none select-none rounded-lg"
            style={{
              backgroundColor: hsvToHex({ h: hsv.h, s: 1, v: 1 }),
              backgroundImage:
                'linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)',
            }}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId)
              moveInArea(event)
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) moveInArea(event)
            }}
          >
            <span
              className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow ring-1 ring-black/30"
              style={{
                left: `${hsv.s * 100}%`,
                top: `${(1 - hsv.v) * 100}%`,
                backgroundColor: hex,
              }}
            />
          </div>

          <input
            type="range"
            min={0}
            max={359}
            value={Math.round(hsv.h)}
            aria-label="Tono"
            onChange={(event) => {
              setHexText(null)
              setHsv((prev) => ({ ...prev, h: Number(event.target.value) }))
            }}
            className="h-3 w-full cursor-pointer appearance-none rounded-full"
            style={{
              background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
            }}
          />

          <div className="flex items-center gap-2">
            <span
              className="h-8 w-8 shrink-0 rounded-full border border-black/10"
              style={{ backgroundColor: hex }}
            />
            <input
              type="text"
              aria-label="Codigo hexadecimal"
              maxLength={7}
              value={hexText ?? hex}
              onChange={(event) => setHexText(event.target.value)}
              onBlur={(event) => commitHexText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  commitHexText(event.currentTarget.value)
                }
              }}
              className="w-full min-w-0 rounded-md border border-slate-200 px-2 py-1 font-mono text-xs uppercase"
            />
          </div>

          <button
            type="button"
            onClick={add}
            className="w-full rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-700"
          >
            Agregar color
          </button>
        </div>
      )}
    </div>
  )
}
