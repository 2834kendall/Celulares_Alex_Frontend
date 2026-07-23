'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'

interface UserModalProps {
  title: string
  subtitle?: string
  onClose: () => void
  children: React.ReactNode
}

/** Ventana emergente de los formularios del módulo (invitar/editar usuario). */
export function UserModal({ title, subtitle, onClose, children }: UserModalProps) {
  // Bloquea el scroll del fondo mientras el modal esté montado.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 px-4 py-6 backdrop-blur-[2px] sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-modal-title"
      onClick={onClose}
    >
      <div
        className="animate-fade-in w-full max-w-lg rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="min-w-0">
            <h3 id="user-modal-title" className="text-sm font-bold text-slate-900">
              {title}
            </h3>
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-full p-1.5 text-slate-500 outline-none transition hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-blue-500/60"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  )
}
