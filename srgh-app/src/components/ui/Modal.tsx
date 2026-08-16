'use client'

import { useId } from 'react'
import { X } from 'lucide-react'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { IconButton } from '@/components/ui/IconButton'

interface ModalProps {
  title: string
  subtitle?: string
  onClose: () => void
  children: React.ReactNode
}

/**
 * Ventana emergente generica compartida entre modulos.
 *
 * Antes existia copiada en `attendance/Modal`, `evaluations/Modal` y
 * `users/UserModal`; las tres eran identicas salvo el `id` del titulo. Ese id
 * ahora sale de `useId()`, que es lo que permite tener dos modales montados a
 * la vez sin que se pisen las relaciones ARIA.
 */
export function Modal({ title, subtitle, onClose, children }: ModalProps) {
  useBodyScrollLock()
  const titleId = useId()

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 px-4 py-6 backdrop-blur-[2px] sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
    >
      <div
        className="animate-fade-in w-full max-w-lg rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="min-w-0">
            <h3 id={titleId} className="text-sm font-bold text-slate-900">
              {title}
            </h3>
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          <IconButton onClick={onClose} aria-label="Cerrar">
            <X className="h-3.5 w-3.5" />
          </IconButton>
        </div>
        {/*
          dvh y no vh: en movil la barra de direcciones se retrae y expande, y
          `vh` se mide siempre contra el viewport MAS GRANDE. Con la barra
          visible, un 70vh real ocupa mas del 70% de lo que se ve y el ultimo
          control del formulario queda debajo del borde, inalcanzable. El caso
          que lo delata es el telefono acostado (812x375).
        */}
        <div className="max-h-[70dvh] overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  )
}
