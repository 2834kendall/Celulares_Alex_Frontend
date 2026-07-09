'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { X } from 'lucide-react'
import { Sidebar } from '@/components/layout/Sidebar'
import { NavLinks } from '@/components/layout/NavLinks'
import { UserMenu } from '@/components/layout/UserMenu'
import { tituloDeRuta } from '@/lib/permissions/zones'
import { BRAND } from '@/lib/brand'

interface AppShellProps {
  permisos: string[]
  email: string
  rol: string | null
  children: React.ReactNode
}

/** Hamburguesa animada: las 3 lineas se transforman en una X al abrir. */
function BurgerIcon({ open }: { open: boolean }) {
  return (
    <span className="relative block h-4 w-5" aria-hidden="true">
      <span
        className={`absolute left-0 h-0.5 w-5 rounded-full bg-current transition-all duration-300 ease-in-out ${
          open ? 'top-[7px] rotate-45' : 'top-0 rotate-0'
        }`}
      />
      <span
        className={`absolute left-0 top-[7px] h-0.5 w-5 rounded-full bg-current transition-all duration-300 ease-in-out ${
          open ? 'opacity-0' : 'opacity-100'
        }`}
      />
      <span
        className={`absolute left-0 h-0.5 w-5 rounded-full bg-current transition-all duration-300 ease-in-out ${
          open ? 'top-[7px] -rotate-45' : 'top-[14px] rotate-0'
        }`}
      />
    </span>
  )
}

/**
 * Cascaron responsive del dashboard.
 * La barra superior ocupa todo el ancho, con la hamburguesa FIJA en la
 * esquina superior izquierda — no se mueve al abrir/cerrar el sidebar.
 * - Escritorio: la hamburguesa colapsa/expande el sidebar (con animacion de ancho)
 * - Movil: la hamburguesa abre el drawer lateral
 * La seguridad ya paso en el layout (server); esto es solo presentacion.
 */
export function AppShell({ permisos, email, rol, children }: AppShellProps) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(true) // escritorio
  const [drawerOpen, setDrawerOpen] = useState(false) // movil

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
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      {/* Barra superior de ancho completo — la hamburguesa vive siempre en la esquina */}
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 md:px-4">
        <div className="flex min-w-0 items-center gap-3">
          {/* Hamburguesa movil: abre el drawer */}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Abrir menu"
            className="rounded-lg p-2.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 md:hidden"
          >
            <BurgerIcon open={drawerOpen} />
          </button>
          {/* Hamburguesa escritorio: colapsa/expande el sidebar */}
          <button
            type="button"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label={sidebarOpen ? 'Ocultar menu lateral' : 'Mostrar menu lateral'}
            aria-expanded={sidebarOpen}
            className="hidden rounded-lg p-2.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 md:inline-flex"
          >
            <BurgerIcon open={sidebarOpen} />
          </button>

          <div className="min-w-0 leading-tight">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              {BRAND.sistema}
            </p>
            <h1 className="truncate text-base font-extrabold tracking-tight text-slate-900 md:text-lg">
              {titulo}
            </h1>
          </div>
        </div>

        <UserMenu email={email} rol={rol} />
      </header>

      {/* Drawer de navegacion movil */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="animate-fade-in fixed inset-0 bg-slate-900/40 backdrop-blur-[2px]"
            aria-hidden="true"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="animate-slide-in-left relative flex h-full w-72 max-w-[80vw] flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-700 text-xs font-black text-white">
                  {BRAND.empresa.charAt(0)}
                </span>
                <div className="leading-tight">
                  <p className="text-sm font-extrabold text-slate-900">{BRAND.empresa}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                    {BRAND.sistema}
                  </p>
                </div>
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
          </div>
        </div>
      )}

      {/* Cuerpo: sidebar + contenido */}
      <div className="flex flex-1">
        <Sidebar permisos={permisos} open={sidebarOpen} />
        {/* key={pathname}: reinicia la animacion de entrada en cada navegacion */}
        <main key={pathname} className="animate-page min-w-0 flex-1 p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
