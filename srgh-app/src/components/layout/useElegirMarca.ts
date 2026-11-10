'use client'

import { useCallback, useTransition } from 'react'
import { toast } from 'sonner'
import { useConfirmLeave } from '@/hooks/useUnsavedChanges'
import { isNextNavigation } from '@/lib/utils/isNextNavigation'
import { setContextoMarca } from '@/modules/settings/actions/setContextoMarca'

/**
 * Única forma de cambiar la marca: la usan el selector, "Ver todas" y las
 * tarjetas de marca. Cambiarla vuelve a montar la página (el `key` del layout), así
 * que con cambios sin guardar primero pide confirmación.
 *
 * Sin `router.refresh()`: la acción ya revalida el layout, y Next devuelve la
 * página nueva en la misma respuesta.
 */
export function useElegirMarca() {
  const [pending, startTransition] = useTransition()
  const confirmLeave = useConfirmLeave()

  const elegir = useCallback(
    (marcaId: number | null) => {
      confirmLeave(() => {
        startTransition(async () => {
          let result: Awaited<ReturnType<typeof setContextoMarca>>
          try {
            result = await setContextoMarca(marcaId)
          } catch (error) {
            // Dentro de una transición, un rechazo sin atrapar cae en la pantalla de error.
            if (!isNextNavigation(error)) {
              toast.error('No se pudo cambiar la marca. Revisá la conexión y reintentá.')
            }
            return
          }
          if (!result.ok) toast.error(result.error)
        })
      })
    },
    [confirmLeave]
  )

  return { pending, elegir }
}
