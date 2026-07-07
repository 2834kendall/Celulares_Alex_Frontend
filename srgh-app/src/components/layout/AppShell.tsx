'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import { Sidebar } from '@/components/layout/Sidebar'
import { NavLinks } from '@/components/layout/NavLinks'
import { LogoutButton } from '@/modules/auth/components/LogoutButton'
import { tituloDeRuta } from '@/lib/permissions/zones'

interface AppShellProps {
  permisos: string[]
  email: string
  rol: string | null
  children: React.ReactNode
}

/**
 * Cascaron responsive del dashboard:
 * - Escritorio: sidebar fijo + topbar
 * - Movil: topbar con hamburguesa + drawer lateral
 * La seguridad ya paso en el layout (server); esto es solo presentacion.
 */
export function AppShell({ permisos, email, rol, children }: AppShellProps) {
  const pathname = usePathname()
  const [drawerOpen, setDrawerOpen] = useState(false)

  const titulo = tituloDeRuta(pathname)

  // Con el drawer abierto: bloquear el scroll del fondo y permitir cerrar con Escape
  useEffect(() => {
    if (!drawerOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false)
    }

    document.addEventListener('keydown', onKeyDown)
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = ''
    }
  }, [drawerOpen])

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      <Sidebar permisos={permisos} />

      {/* Drawer de navegacion movil */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px]"
            aria-hidden="true"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="relative flex h-full w-72 max-w-[80vw] flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-xs font-black text-white">
                  S
                </span>
                <span className="text-sm font-extrabold text-slate-900">SGRH</span>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Cerrar menu"
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              <NavLinks permisos={permisos} onNavigate={() => setDrawerOpen(false)} />
            </div>

            <div className="border-t border-slate-100 p-4">
              <div className="mb-3 leading-tight">
                <p className="truncate text-xs font-semibold text-slate-700">{email}</p>
                {rol && (
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    {rol}
                  </p>
                )}
              </div>
              <LogoutButton className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60" />
            </div>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 md:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Abrir menu"
              className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 md:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="leading-tight">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                SGRH
              </p>
              <h1 className="text-base font-extrabold tracking-tight text-slate-900 md:text-lg">
                {titulo}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 md:gap-4">
            <div className="hidden text-right leading-tight sm:block">
              <p className="max-w-[220px] truncate text-sm text-slate-700">{email}</p>
              {rol && (
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {rol}
                </p>
              )}
            </div>
            <LogoutButton />
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}
