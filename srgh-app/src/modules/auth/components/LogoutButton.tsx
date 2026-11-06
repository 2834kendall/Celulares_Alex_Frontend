'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { logout } from '@/modules/auth/actions/logout'
import { useConfirmLeave } from '@/hooks/useUnsavedChanges'

interface LogoutButtonProps {
  label?: string
  className?: string
}

export function LogoutButton({
  label = 'Cerrar sesion',
  className = 'inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60',
}: LogoutButtonProps) {
  const router = useRouter()
  const confirmLeave = useConfirmLeave()
  const [loading, setLoading] = useState(false)

  async function handleLogout() {
    setLoading(true)
    try {
      // La accion cierra la sesion y devuelve { ok }; la navegacion se hace
      // aca y no con redirect() en el servidor, porque en Next 16 un redirect
      // de Server Action le llega al cliente como un rechazo de la promesa y
      // caeria en el catch de abajo como si fuera una caida de red.
      const result = await logout()

      if (!result.ok) {
        toast.error(result.error)
        setLoading(false)
        return
      }

      // replace y no push: volver Atras al dashboard de una sesion cerrada no
      // tiene sentido. El boton queda deshabilitado hasta que la navegacion lo
      // desmonte, para que no se pueda disparar dos veces.
      router.replace('/login')
    } catch {
      // Solo fallos de red: no bloquear el boton, y decirlo, para que nadie se
      // vaya creyendo que salio.
      toast.error(
        'No se pudo conectar para cerrar la sesión. Revise su conexión e intente de nuevo.'
      )
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => confirmLeave(() => void handleLogout())}
      disabled={loading}
      className={className}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
      {label}
    </button>
  )
}
