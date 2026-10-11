'use client'

import { useId, useRef } from 'react'
import { X } from 'lucide-react'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { useDialog } from '@/hooks/useDialog'
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
 *
 * Teclado y foco (Escape, Tab atrapado, foco de vuelta al cerrar) viven en
 * `useDialog`, compartido con ConfirmDialog.
 */
export function Modal({ title, subtitle, onClose, children }: ModalProps) {
  useBodyScrollLock()
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  useDialog(panelRef, onClose)

  // Tocar el fondo cierra el modal, salvo que ya se haya escrito algo: con
  // un formulario de diez campos, un toque de más al costado (en el celular
  // pasa seguido) borraba todo lo cargado. Con datos, el fondo solo hace que
  // el panel "rebote" para indicar que se cierra con la X o con Escape.
  const touchedRef = useRef(false)
  function onBackdropClick() {
    if (!touchedRef.current) {
      onClose()
      return
    }
    // Imperativo y no con estado: cambiar la `key` del panel para reiniciar
    // la animacion lo remontaria y borraria justo lo que se quiere cuidar.
    const panel = panelRef.current
    if (!panel) return
    panel.classList.remove('animate-modal-in', 'animate-modal-nudge')
    void panel.offsetWidth // fuerza el reflow para que la animacion reinicie
    panel.classList.add('animate-modal-nudge')
  }

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 px-4 py-6 backdrop-blur-[2px] sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onBackdropClick}
    >
      {/*
        El fondo se funde (`animate-fade-in` en el contenedor) y el panel
        ademas escala: entrar los dos con la misma opacidad plana hacia que
        el modal "apareciera" de golpe, sin sensacion de que sale del clic.
      */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className="animate-modal-in w-full max-w-lg rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/5 outline-none"
        onClick={(e) => e.stopPropagation()}
        onInput={() => {
          touchedRef.current = true
        }}
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
