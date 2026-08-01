'use client'

import { useState } from 'react'
import { Delete, X } from 'lucide-react'

interface PinPadProps {
  onConfirm: (pin: string) => void
  onCancel: () => void
}

const NUMBER_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

/** Teclado numerico a pantalla completa para el PIN de respaldo (año de nacimiento, 4 digitos). */
export function PinPad({ onConfirm, onCancel }: PinPadProps) {
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
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-slate-950/95 px-6 text-white"
    >
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cancelar"
        className="absolute right-6 top-6 rounded-full p-3 text-slate-300 outline-none transition hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/60"
      >
        <X className="h-6 w-6" />
      </button>

      <p className="text-center text-lg font-semibold">
        Ingresa tu año de nacimiento
        <span className="block text-sm font-normal text-slate-400">4 digitos, ej. 1990</span>
      </p>

      <div className="flex gap-3" aria-hidden="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <span
            key={i}
            className={`flex h-14 w-11 items-center justify-center rounded-xl border-2 text-2xl font-bold ${
              pin[i] ? 'border-blue-500 bg-blue-500/10' : 'border-slate-600'
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
            className="h-16 w-16 rounded-2xl bg-white/10 text-2xl font-bold outline-none transition hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/60 active:scale-95"
          >
            {digit}
          </button>
        ))}
        <div />
        <button
          type="button"
          onClick={() => press('0')}
          className="h-16 w-16 rounded-2xl bg-white/10 text-2xl font-bold outline-none transition hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/60 active:scale-95"
        >
          0
        </button>
        <button
          type="button"
          onClick={backspace}
          aria-label="Borrar"
          className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 outline-none transition hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/60 active:scale-95"
        >
          <Delete className="h-6 w-6" />
        </button>
      </div>
    </div>
  )
}
