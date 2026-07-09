'use client'

import { type FormEvent, useState } from 'react'
import { X } from 'lucide-react'
import { TimeSelect } from './TimeSelect'

interface CustomHoursModalProps {
  employeeName: string
  dayLabel: string
  initialEntrada: string
  initialSalida: string
  onClose: () => void
  onConfirm: (entrada: string, salida: string) => Promise<void> | void
}

export function CustomHoursModal({
  employeeName,
  dayLabel,
  initialEntrada,
  initialSalida,
  onClose,
  onConfirm,
}: CustomHoursModalProps) {
  const [entrada, setEntrada] = useState(initialEntrada)
  const [salida, setSalida] = useState(initialSalida)
  const [isSaving, setIsSaving] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSaving(true)
    await onConfirm(entrada, salida)
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
            className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
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
            <TimeSelect value={entrada} onChange={setEntrada} />
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Hora de salida
            </label>
            <TimeSelect value={salida} onChange={setSalida} />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 active:scale-[0.98] disabled:opacity-60"
            >
              {isSaving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
