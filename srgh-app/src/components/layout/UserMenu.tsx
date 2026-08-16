'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { UserRound } from 'lucide-react'
import { LogoutButton } from '@/modules/auth/components/LogoutButton'

interface UserMenuProps {
  email: string
  rol: string | null
}

/**
 * Identidad del usuario en el topbar: correo y rol siempre visibles
 * a la izquierda del avatar; el menu desplegable da acceso al perfil
 * y al cierre de sesion.
 */
export function UserMenu({ email, rol }: UserMenuProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const initials = email.slice(0, 2).toUpperCase()

  // Cerrar con click fuera o con Escape
  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="relative flex items-center gap-3" ref={containerRef}>
      {/*
        El correo y el rol se ocultan en pantallas angostas: reservaban hasta
        180px fijos del topbar y eso dejaba el titulo de la pagina en
        "Asisten…". En un telefono el avatar ya identifica la sesion, y el
        correo completo sigue estando a un toque, dentro de este mismo menu.
      */}
      <div className="hidden min-w-0 text-right leading-tight sm:block">
        <p className="max-w-[180px] truncate text-sm font-semibold text-slate-700 md:max-w-[260px]">
          {email}
        </p>
        {rol && (
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{rol}</p>
        )}
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Menu de usuario"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-700 text-xs font-bold text-white transition hover:bg-brand-800 active:scale-95 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:ring-offset-2"
      >
        {initials}
      </button>

      {open && (
        <div className="animate-menu-pop absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
          {/*
            Solo en angosto: ahi el correo no cabe en el topbar, y sin esto no
            quedaria ninguna forma de ver con que cuenta se esta trabajando.
            Desde sm: es redundante, porque ya se lee al lado del avatar.
          */}
          <div className="border-b border-slate-100 px-3 pb-2 pt-1 sm:hidden">
            <p className="truncate text-sm font-semibold text-slate-700">{email}</p>
            {rol && (
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {rol}
              </p>
            )}
          </div>

          <Link
            href="/profile"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <UserRound className="h-4 w-4" />
            Mi perfil
          </Link>

          <div className="my-1 border-t border-slate-100" />

          <LogoutButton className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60" />
        </div>
      )}
    </div>
  )
}
