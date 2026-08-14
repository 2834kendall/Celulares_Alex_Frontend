'use client'

import { useEffect } from 'react'

/**
 * Bloquea el scroll del fondo mientras el componente este montado.
 *
 * Vive en `hooks/` (compartido) y no dentro de `components/ui/Modal` porque lo
 * consumen tanto `Modal` como `ConfirmDialog`: antes estaba duplicado en tres
 * archivos y `ui/ConfirmDialog` se habia quedado sin llamarlo, con lo que el
 * fondo seguia scrolleando detras del dialogo.
 */
export function useBodyScrollLock() {
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])
}
