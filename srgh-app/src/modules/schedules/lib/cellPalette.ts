import type { CSSProperties } from 'react'
import { lighten } from '@/lib/utils/color'

export interface CellPalette {
  fill: string
  border: string
  stripe: string
}

// Color estable por hor_id, compartido entre WeeklyScheduleMatrix y MyScheduleView.
export const SCHEDULE_PALETTE: CellPalette[] = [
  { fill: '#E7EEFC', border: '#C5D3EB', stripe: '#D7E3F6' }, // azul bruma
  { fill: '#FBEDDC', border: '#EDD5B4', stripe: '#F5E2CA' }, // durazno
  { fill: '#DFF2E7', border: '#B8DCC7', stripe: '#CEEADA' }, // menta
  { fill: '#F9F1D0', border: '#E6D8A2', stripe: '#F1E8BE' }, // amarillo
  { fill: '#DEF0F5', border: '#B4D9E3', stripe: '#CDE7EE' }, // aqua
  { fill: '#F1EBE2', border: '#D6C9B6', stripe: '#E6DDCF' }, // arena
]

export const CUSTOM_PALETTE: CellPalette = { fill: '#EDEAFC', border: '#D0C8EE', stripe: '#E1DCF6' }
export const NEUTRAL_STRIPE = '#E2E8F0'

// Deriva fill/border/stripe del color a medida elegido en la plantilla.
export function customSchedulePalette(hex: string): CellPalette {
  return {
    fill: lighten(hex, 0.55),
    border: lighten(hex, 0.2),
    stripe: lighten(hex, 0.4),
  }
}

// Prioridad: personalizado > sin horario > color manual > rotacion por hor_id.
export function paletteForSchedule(day: {
  scheduleId: number | null
  isCustom: boolean
  manualColor?: string | null
}): CellPalette | null {
  if (day.isCustom) return CUSTOM_PALETTE
  if (day.scheduleId == null) return null
  if (day.manualColor) return customSchedulePalette(day.manualColor)
  return SCHEDULE_PALETTE[day.scheduleId % SCHEDULE_PALETTE.length]
}

// Rayado diagonal para dias de descanso.
export function hatchStyle(color: string): CSSProperties {
  return {
    backgroundImage: `repeating-linear-gradient(135deg, ${color} 0 5px, transparent 5px 11px)`,
  }
}
