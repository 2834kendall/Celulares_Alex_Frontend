'use client'

import { type FormEvent, useState } from 'react'
import { X } from 'lucide-react'

interface CustomHoursModalProps {
  employeeName: string
  dayLabel: string
  initialEntrada: string
  initialSalida: string
  onClose: () => void
  onConfirm: (entrada: string, salida: string) => Promise<void> | void
}

const INPUT_CLASSES =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 shadow-sm outline-none transition focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20'

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
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 px-4 py-4 sm:items-center sm:py-6">
      <div className="w-[calc(100vw-2rem)] max-w-md max-h-[calc(100vh-2rem)] overflow-y-auto rounded-3xl bg-white p-4 shadow-2xl sm:p-5">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Horario personalizado
            </p>
            <h3 className="mt-1 text-lg font-black text-slate-900">{employeeName}</h3>
            <p className="text-sm text-slate-500">{dayLabel}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Cerrar modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                Hora de entrada
              </label>
              <input
                type="time"
                value={entrada}
                onChange={(event) => setEntrada(event.target.value)}
                className={INPUT_CLASSES}
                required
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                Hora de salida
              </label>
              <input
                type="time"
                value={salida}
                onChange={(event) => setSalida(event.target.value)}
                className={INPUT_CLASSES}
                required
              />
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
            >
              {isSaving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
