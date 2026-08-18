'use client'

import { useState } from 'react'
import { Delete, X } from 'lucide-react'

interface PinPadProps {
  onConfirm: (pin: string) => void
  onCancel: () => void
  /**
   * Nombre del empleado al que se le pide el PIN. El teclado se abre solo al
   * elegir un nombre y tapa la pantalla entera, asi que sin esto no quedaba
   * ninguna señal de a quien se esta por marcar — y equivocarse solo se
   * notaba despues de marcar.
   */
  employeeName?: string | null
}

const NUMBER_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

/** Teclado numerico a pantalla completa para el PIN de respaldo (año de nacimiento, 4 digitos). */
export function PinPad({ onConfirm, onCancel, employeeName = null }: PinPadProps) {
  const [pin, setPin] = useState('')

  function press(digit: string) {
    if (pin.length >= 4) return
    const next = pin + digit
    setPin(next)
    if (next.length === 4) {
      onConfirm(next)
    }
  }

  function backspace() {
    setPin((p) => p.slice(0, -1))
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Ingresa tu año de nacimiento"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-background px-6 text-foreground"
    >
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cancelar"
        className="absolute right-4 top-4 inline-flex min-h-12 min-w-12 items-center justify-center rounded-full text-slate-500 outline-none transition hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-brand-600/40"
      >
        <X className="h-6 w-6" />
      </button>

      <div className="text-center">
        {employeeName && (
          <p className="mb-2 text-2xl font-semibold text-brand-700">{employeeName}</p>
        )}
        <p className="text-xl font-semibold">
          Ingresa tu año de nacimiento
          <span className="mt-1 block text-base font-normal text-slate-500">
            4 digitos, ej. 1990
          </span>
        </p>
      </div>

      <div className="flex gap-3" aria-hidden="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <span
            key={i}
            className={`flex h-16 w-12 items-center justify-center rounded-xl border-2 text-3xl font-bold transition ${
              pin[i] ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-300'
            }`}
          >
            {pin[i] ? '•' : ''}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {NUMBER_KEYS.map((digit) => (
          <button
            key={digit}
            type="button"
            onClick={() => press(digit)}
            className="h-20 w-20 rounded-2xl border border-slate-200 bg-white text-3xl font-bold text-slate-800 outline-none transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-brand-600/40 active:scale-95 motion-reduce:active:scale-100"
          >
            {digit}
          </button>
        ))}
        <div />
        <button
          type="button"
          onClick={() => press('0')}
          className="h-20 w-20 rounded-2xl border border-slate-200 bg-white text-3xl font-bold text-slate-800 outline-none transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-brand-600/40 active:scale-95 motion-reduce:active:scale-100"
        >
          0
        </button>
        <button
          type="button"
          onClick={backspace}
          aria-label="Borrar"
          className="flex h-20 w-20 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-800 outline-none transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-brand-600/40 active:scale-95 motion-reduce:active:scale-100"
        >
          <Delete className="h-7 w-7" />
        </button>
      </div>
    </div>
  )
}
