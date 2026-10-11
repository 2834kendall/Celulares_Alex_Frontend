'use client'

import { useRef } from 'react'
import { scoreColor } from '@/modules/evaluations/lib/scoring'
import { readableTextOn } from '@/lib/utils/color'
import { cn } from '@/lib/utils/cn'

export interface ScoreValue {
  puntaje: number | null
  noAplica: boolean
}

interface ScoreScaleProps {
  value: ScoreValue
  onChange: (value: ScoreValue) => void
  /** Nombre del criterio: nombra el grupo ante lectores de pantalla. */
  label: string
  disabled?: boolean
}

const OPCIONES: (number | 'na')[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 'na']

/**
 * Calificación 0-10 (o "No aplica") de un toque.
 *
 * Reemplaza un `<input type="number">`: en el celular cada criterio era
 * tocar el campo → abrir el teclado → escribir → cerrarlo, siete veces por
 * candidato. Acá es un toque por criterio, y el color del número elegido
 * (el mismo de evaluaciones, `scoreColor`) dice de un vistazo si es bajo o
 * alto.
 *
 * Teclado: es un radiogroup. Una sola parada de Tab por criterio (no doce)
 * y las flechas mueven la selección, como en cualquier grupo de radios.
 */
export function ScoreScale({ value, onChange, label, disabled = false }: ScoreScaleProps) {
  const groupRef = useRef<HTMLDivElement>(null)

  const selectedIndex = value.noAplica
    ? OPCIONES.length - 1
    : value.puntaje !== null
      ? OPCIONES.indexOf(value.puntaje)
      : -1
  const focusIndex = selectedIndex >= 0 ? selectedIndex : 0

  function select(index: number) {
    const opcion = OPCIONES[index]
    onChange(
      opcion === 'na' ? { puntaje: null, noAplica: true } : { puntaje: opcion, noAplica: false }
    )
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const delta =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? -1
          : 0
    let next: number | null = null
    if (delta !== 0) next = (focusIndex + delta + OPCIONES.length) % OPCIONES.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = OPCIONES.length - 1
    if (next === null) return

    e.preventDefault()
    select(next)
    groupRef.current?.querySelector<HTMLElement>(`[data-index="${next}"]`)?.focus()
  }

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label={`Puntaje de ${label}`}
      onKeyDown={onKeyDown}
      // 6 columnas en el celular (dos filas de 44px de alto y ~48px de
      // ancho a 375px), una sola fila desde sm.
      className="grid grid-cols-6 gap-1 sm:grid-cols-12"
    >
      {OPCIONES.map((opcion, index) => {
        const checked = index === selectedIndex
        const fondo = checked && opcion !== 'na' ? scoreColor(opcion) : undefined
        return (
          <button
            key={opcion}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={opcion === 'na' ? 'No aplica' : String(opcion)}
            data-index={index}
            tabIndex={index === focusIndex ? 0 : -1}
            disabled={disabled}
            onClick={() => select(index)}
            style={fondo ? { backgroundColor: fondo, color: readableTextOn(fondo) } : undefined}
            className={cn(
              'flex min-h-9 items-center justify-center rounded-lg border text-xs font-bold tabular-nums outline-none transition pointer-coarse:min-h-11 focus-visible:ring-2 focus-visible:ring-brand-500/60 focus-visible:ring-offset-1 active:scale-95 motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:active:scale-100',
              checked
                ? opcion === 'na'
                  ? 'border-slate-700 bg-slate-700 text-white'
                  : 'border-transparent shadow-sm'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 disabled:hover:bg-white',
              !checked && disabled && 'opacity-60'
            )}
          >
            {opcion === 'na' ? 'N/A' : opcion}
          </button>
        )
      })}
    </div>
  )
}
