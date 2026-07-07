'use client'

import { useState } from 'react'
import { Loader2, LogOut } from 'lucide-react'
import { logout } from '@/modules/auth/actions/logout'

interface LogoutButtonProps {
  label?: string
  className?: string
}

export function LogoutButton({
  label = 'Cerrar sesion',
  className = 'inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60',
}: LogoutButtonProps) {
  const [loading, setLoading] = useState(false)

  async function handleLogout() {
    setLoading(true)
    try {
      // Server Action: cierra la sesion en el servidor y redirige a /login
      await logout()
    } catch {
      // Si el logout falla (ej. sin conexion), no bloquear el boton
    } finally {
      setLoading(false)
    }
  }

  return (
    <button type="button" onClick={handleLogout} disabled={loading} className={className}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
      {label}
    </button>
  )
}
