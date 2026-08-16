'use client'

import { type FormEvent, useState } from 'react'
import { X } from 'lucide-react'
import { TimeSelect } from '@/components/ui/TimeSelect'
import { WEEKDAY_NAMES } from '@/modules/schedules/lib/week'
import { IconButton } from '@/components/ui/IconButton'
import { Button } from '@/components/ui/Button'
import { LABEL } from '@/components/ui/styles'

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
          <span className="absolute inset-0 rounded-full bg-slate-200 transition-colors peer-checked:bg-brand-600 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500 peer-focus-visible:ring-offset-2" />
          <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4" />
        </span>
        <span className="text-xs text-slate-700">{label}</span>
      </label>

      {enabled && (
        <div className="mt-3 space-y-2.5">
          <div>
            <label className={LABEL}>Inicio</label>
            <TimeSelect value={start} onChange={onChangeStart} />
          </div>
          <div>
            <label className={LABEL}>Fin</label>
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
  // 10 min es el break estandar: coincide con los minutos pagados que
  // getWeeklySchedule no descuenta de las horas trabajadas.
  const [breakEnd, setBreakEnd] = useState(initialBreakEnd ?? '10:10')

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
    <div className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-[2px]">
      {/*
        El panel se limita a la altura de la ventana y solo scrollea el cuerpo,
        para que la cabecera y los botones queden siempre visibles aunque el
        formulario crezca (almuerzo + break desplegados).
      */}
      <div className="animate-fade-in flex max-h-[calc(100dvh-1.5rem)] w-full max-w-[21rem] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/5">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-600">
              Horario personalizado
            </p>
            <h3 className="mt-0.5 text-sm font-bold text-slate-900">{employeeName}</h3>
            <p className="text-xs text-slate-500">{dayLabel}</p>
          </div>

          <IconButton
            onClick={onClose}

            aria-label="Cerrar modal"
          >
            <X className="h-3.5 w-3.5" />
          </IconButton>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3.5">
            <div>
              <label className={LABEL}>Hora de entrada</label>
              <TimeSelect value={startTime} onChange={setStartTime} />
            </div>

            <div>
              <label className={LABEL}>Hora de salida</label>
              <TimeSelect value={endTime} onChange={setEndTime} />
            </div>

            <div>
              <label className={LABEL}>Aplicar a estos días</label>
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
                      className={`rounded-lg px-2 py-1 text-[10px] font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-brand-500/60 ${
                        isUnavailable
                          ? 'cursor-not-allowed bg-slate-100 text-slate-300'
                          : isSelected
                            ? 'bg-brand-600 text-white shadow-sm'
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
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-100 px-4 py-3">
            <Button onClick={onClose} variant="secondary" size="md">
              Cancelar
            </Button>
            <Button type="submit" disabled={isSaving || applyToDates.length === 0} size="md">
              {isSaving ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
