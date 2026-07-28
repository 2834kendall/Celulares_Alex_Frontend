'use client'

import { type FormEvent, useState } from 'react'
import { X } from 'lucide-react'
import { TimeSelect } from './TimeSelect'
import { WEEKDAY_NAMES } from '@/modules/schedules/lib/week'

export interface CustomHoursValues {
  startTime: string
  endTime: string
  lunchStart: string | null
  lunchEnd: string | null
  breakStart: string | null
  breakEnd: string | null
  /** Fechas ISO de la semana visible a las que se debe aplicar este horario. */
  applyToDates: string[]
}

interface CustomHoursModalProps {
  employeeName: string
  dayLabel: string
  /** Fechas ISO (Lunes..Domingo) de la semana visible, para el selector de dias. */
  weekDates: string[]
  /** Fecha ISO que abrio el modal — viene pre-marcada. */
  initialDate: string
  /** Fechas ISO que no se pueden marcar (p. ej. cubiertas por una incapacidad). */
  unavailableDates?: string[]
  initialStartTime: string
  initialEndTime: string
  initialLunchStart?: string | null
  initialLunchEnd?: string | null
  initialBreakStart?: string | null
  initialBreakEnd?: string | null
  onClose: () => void
  onConfirm: (values: CustomHoursValues) => Promise<void> | void
}

interface OptionalPeriodProps {
  label: string
  enabled: boolean
  onToggle: (enabled: boolean) => void
  start: string
  end: string
  onChangeStart: (value: string) => void
  onChangeEnd: (value: string) => void
  idPrefix: string
}

function OptionalPeriod({
  label,
  enabled,
  onToggle,
  start,
  end,
  onChangeStart,
  onChangeEnd,
  idPrefix,
}: OptionalPeriodProps) {
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <label
        htmlFor={`${idPrefix}-toggle`}
        className="flex cursor-pointer select-none items-center gap-3"
      >
        <span className="relative inline-flex h-5 w-9 shrink-0 items-center">
          <input
            type="checkbox"
            id={`${idPrefix}-toggle`}
            checked={enabled}
            onChange={(event) => onToggle(event.target.checked)}
            className="peer sr-only"
          />
          <span className="absolute inset-0 rounded-full bg-slate-200 transition-colors peer-checked:bg-blue-600 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 peer-focus-visible:ring-offset-2" />
          <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4" />
        </span>
        <span className="text-xs text-slate-700">{label}</span>
      </label>

      {enabled && (
        <div className="mt-3 space-y-2.5">
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Inicio
            </label>
            <TimeSelect value={start} onChange={onChangeStart} />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Fin
            </label>
            <TimeSelect value={end} onChange={onChangeEnd} />
          </div>
        </div>
      )}
    </div>
  )
}

export function CustomHoursModal({
  employeeName,
  dayLabel,
  weekDates,
  initialDate,
  unavailableDates = [],
  initialStartTime,
  initialEndTime,
  initialLunchStart,
  initialLunchEnd,
  initialBreakStart,
  initialBreakEnd,
  onClose,
  onConfirm,
}: CustomHoursModalProps) {
  const [startTime, setStartTime] = useState(initialStartTime)
  const [endTime, setEndTime] = useState(initialEndTime)

  const [hasLunch, setHasLunch] = useState(Boolean(initialLunchStart && initialLunchEnd))
  const [lunchStart, setLunchStart] = useState(initialLunchStart ?? '12:00')
  const [lunchEnd, setLunchEnd] = useState(initialLunchEnd ?? '13:00')

  const [hasBreak, setHasBreak] = useState(Boolean(initialBreakStart && initialBreakEnd))
  const [breakStart, setBreakStart] = useState(initialBreakStart ?? '10:00')
  const [breakEnd, setBreakEnd] = useState(initialBreakEnd ?? '10:15')

  const [applyToDates, setApplyToDates] = useState<string[]>([initialDate])

  const [isSaving, setIsSaving] = useState(false)

  function toggleDate(date: string) {
    setApplyToDates((prev) =>
      prev.includes(date) ? prev.filter((d) => d !== date) : [...prev, date]
    )
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (applyToDates.length === 0) return
    setIsSaving(true)
    await onConfirm({
      startTime,
      endTime,
      lunchStart: hasLunch ? lunchStart : null,
      lunchEnd: hasLunch ? lunchEnd : null,
      breakStart: hasBreak ? breakStart : null,
      breakEnd: hasBreak ? breakEnd : null,
      applyToDates,
    })
    setIsSaving(false)
  }

  return (
    <div className="animate-fade-in fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 px-4 py-4 backdrop-blur-[2px] sm:items-center sm:py-5">
      <div className="animate-fade-in w-full max-w-[19rem] overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl ring-1 ring-slate-900/5">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-600">
              Horario personalizado
            </p>
            <h3 className="mt-0.5 text-sm font-bold text-slate-900">{employeeName}</h3>
            <p className="text-xs text-slate-500">{dayLabel}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-500 outline-none transition hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-blue-500/60"
            aria-label="Cerrar modal"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-3.5 space-y-3">
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Hora de entrada
            </label>
            <TimeSelect value={startTime} onChange={setStartTime} />
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Hora de salida
            </label>
            <TimeSelect value={endTime} onChange={setEndTime} />
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Aplicar a estos días
            </label>
            <div className="flex flex-wrap gap-1.5">
              {weekDates.map((date, index) => {
                const isSelected = applyToDates.includes(date)
                const isUnavailable = unavailableDates.includes(date)
                return (
                  <button
                    key={date}
                    type="button"
                    disabled={isUnavailable}
                    onClick={() => toggleDate(date)}
                    aria-pressed={isSelected}
                    title={
                      isUnavailable ? 'Día cubierto por una incapacidad o licencia' : undefined
                    }
                    className={`rounded-lg px-2 py-1 text-[10px] font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-blue-500/60 ${
                      isUnavailable
                        ? 'cursor-not-allowed bg-slate-100 text-slate-300'
                        : isSelected
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {WEEKDAY_NAMES[index].slice(0, 3)}
                  </button>
                )
              })}
            </div>
            {applyToDates.length === 0 && (
              <p className="mt-1 text-[10px] text-rose-600">Seleccione al menos un día.</p>
            )}
          </div>

          <OptionalPeriod
            idPrefix="custom-lunch"
            label="Incluye almuerzo"
            enabled={hasLunch}
            onToggle={setHasLunch}
            start={lunchStart}
            end={lunchEnd}
            onChangeStart={setLunchStart}
            onChangeEnd={setLunchEnd}
          />

          <OptionalPeriod
            idPrefix="custom-break"
            label="Incluye break"
            enabled={hasBreak}
            onToggle={setHasBreak}
            start={breakStart}
            end={breakEnd}
            onChangeStart={setBreakStart}
            onChangeEnd={setBreakEnd}
          />

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-2"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving || applyToDates.length === 0}
              className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm outline-none transition hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 active:scale-[0.98] disabled:opacity-60"
            >
              {isSaving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
