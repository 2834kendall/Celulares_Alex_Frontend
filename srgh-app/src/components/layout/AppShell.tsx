'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { X } from 'lucide-react'
import { Sidebar } from '@/components/layout/Sidebar'
import { NavLinks } from '@/components/layout/NavLinks'
import { UserMenu } from '@/components/layout/UserMenu'
import { MarcaPreviewBanner, MarcaSwitcher } from '@/components/layout/MarcaSwitcher'
import type { MarcaApariencia } from '@/lib/empresa/get-marca-tema'
import { shellIdentity } from '@/lib/empresa/marca-label'
import { ICON_CONTROL_BASE } from '@/components/ui/IconButton'
import { cn } from '@/lib/utils/cn'
import { CompanyIdentity } from '@/components/layout/CompanyIdentity'
import { TopbarBrand } from '@/components/layout/TopbarBrand'
import { deriveBrandTokens, derivePageBackground, deriveSidebarTokens } from '@/lib/utils/color'
import { FormatoHoraProvider } from '@/lib/time/FormatoHoraContext'
import { FORMATO_HORA_DEFAULT, type FormatoHora } from '@/lib/time/formatoHora'
import { SettingsModeHeader } from '@/modules/settings/components/SettingsModeHeader'
import { SettingsSidebarNav } from '@/modules/settings/components/SettingsSidebarNav'
import { SettingsSearch } from '@/modules/settings/components/SettingsSearch'
import { isSettingsPath, rememberReturnPath } from '@/modules/settings/lib/returnPath'

interface AppShellProps {
  permisos: string[]
  email: string
  rol: string | null
  /** Nombre real de la empresa (cargado server-side desde sgrh_empresas). */
  empresaNombre: string
  /** URL firmada del logo (de la marca, o el de la empresa), o null para mostrar la inicial. */
  logoUrl?: string | null
  /** Marca que pinta el shell (propia o en preview), o null = vista de empresa. */
  marcaNombre?: string | null
  /** Sucursal asignada al usuario, o null si no tiene una fija (p.ej. ADMIN). */
  sucursalNombre: string | null
  /** Color de acento (marca → empresa), o null para usar el default del sistema. */
  colorAcento: string | null
  /** Color de fondo de la barra lateral (marca → empresa), o null para el default. */
  colorSidebar: string | null
  /** Marcas de la empresa con permiso EMPRESAS_WRITE; vacio para el resto. */
  marcas?: MarcaApariencia[]
  /** Marca actualmente en preview (ver MarcaSwitcher), o null. */
  marcaPreviewId?: number | null
  /** Formato de hora de la empresa (Configuración → General). Solo presentación. */
  formatoHora?: FormatoHora
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
 * - Escritorio: la empresa ocupa la columna izquierda de la barra superior,
 *   del mismo ancho que el sidebar; su boton colapsa el sidebar a un riel de
 *   iconos (y el logo del riel lo vuelve a expandir).
 * - Movil: la hamburguesa abre el drawer lateral.
 * La seguridad ya paso en el layout (server); esto es solo presentacion.
 */
export function AppShell({
  permisos,
  email,
  rol,
  empresaNombre,
  logoUrl = null,
  marcaNombre = null,
  sucursalNombre,
  colorAcento,
  colorSidebar,
  marcas = [],
  marcaPreviewId = null,
  formatoHora = FORMATO_HORA_DEFAULT,
  children,
}: AppShellProps) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(true) // escritorio: false = riel de iconos
  const [drawerOpen, setDrawerOpen] = useState(false) // movil
  const [settingsSearchOpen, setSettingsSearchOpen] = useState(false)

  // Modo configuración (SGRH-92): en /settings… el menú lateral pasa a ser el
  // de Configuración y se habilita el buscador de ajustes (Ctrl+K).
  const settingsMode = isSettingsPath(pathname)

  // Destino de "← Volver": la última pantalla fuera de Configuración. Con la
  // query incluida, para volver a la misma pestaña (ej. ?tab=usuarios).
  useEffect(() => {
    rememberReturnPath(`${window.location.pathname}${window.location.search}`)
  }, [pathname])

  // Identidad del shell: la marca (si hay) con su sucursal debajo; si no, la
  // empresa. Ver shellIdentity.
  const identidad = shellIdentity(empresaNombre, marcaNombre, sucursalNombre)

  // Estilo de apariencia (marca → empresa): si no hay un color, no se
  // sobrescribe nada y gana el default declarado en globals.css.
  const shellStyle = {
    ...(colorAcento ? deriveBrandTokens(colorAcento) : {}),
    ...(colorSidebar ? deriveSidebarTokens(colorSidebar) : {}),
    ...(colorSidebar ? { '--page-bg': derivePageBackground(colorSidebar) } : {}),
  } as React.CSSProperties

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
    <div
      id="app-shell-root"
      className="flex min-h-screen flex-col bg-[var(--page-bg)] text-slate-900"
      style={shellStyle}
    >
      {/*
        Barra superior de ancho completo. A la izquierda va la empresa: en
        escritorio, en una columna del mismo ancho que el sidebar (ver
        TopbarBrand), con el boton de colapsar; en movil, compacta junto a la
        hamburguesa. Ya no muestra el titulo de la ruta: lo pone el
        encabezado de cada pagina (PageHeader).
      */}
      <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] px-3 md:pr-4 md:pl-0">
        {/* Hamburguesa movil: abre el drawer */}
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Abrir menú"
          // El icono mide 16x20, asi que con p-2.5 el boton quedaba en
          // 36x40: por debajo de los 44px de WCAG 2.5.5, y es el control
          // MAS usado de toda la app en un telefono. El minimo solo aplica
          // con dedo, asi que en escritorio el boton no cambia de tamaño.
          className="inline-flex shrink-0 items-center justify-center rounded-lg p-2.5 pointer-coarse:min-h-11 pointer-coarse:min-w-11 text-[var(--sidebar-text)] transition hover:bg-black/5 hover:text-[var(--sidebar-text-strong)] md:hidden"
        >
          <BurgerIcon open={drawerOpen} />
        </button>

        <CompanyIdentity
          className="md:hidden"
          size="sm"
          compact
          logoUrl={logoUrl}
          empresaNombre={identidad.nombre}
          sucursalNombre={identidad.detalle}
        />

        <TopbarBrand
          className="hidden md:flex"
          collapsed={!sidebarOpen}
          onToggle={() => setSidebarOpen((v) => !v)}
          logoUrl={logoUrl}
          empresaNombre={identidad.nombre}
          sucursalNombre={identidad.detalle}
        />

        <div className="ml-auto flex shrink-0 items-center gap-3">
          <MarcaSwitcher marcas={marcas} marcaPreviewId={marcaPreviewId} />
          <UserMenu email={email} rol={rol} />
        </div>
      </header>

      {marcaPreviewId !== null && marcaNombre && <MarcaPreviewBanner marcaNombre={marcaNombre} />}

      {/* Drawer de navegacion movil */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="animate-fade-in fixed inset-0 bg-slate-900/40 backdrop-blur-[2px]"
            aria-hidden="true"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="animate-slide-in-left relative flex h-full w-72 max-w-[80vw] flex-col bg-[var(--sidebar-bg)] shadow-2xl">
            <div
              className={cn(
                'flex items-center justify-between border-b px-4 py-4',
                settingsMode ? 'border-brand-800 bg-brand-700' : 'border-[var(--sidebar-border)]'
              )}
            >
              {settingsMode ? (
                <SettingsModeHeader empresaNombre={empresaNombre} compact />
              ) : (
                <CompanyIdentity
                  size="sm"
                  logoUrl={logoUrl}
                  empresaNombre={identidad.nombre}
                  sucursalNombre={identidad.detalle}
                />
              )}
              {/*
                No usa <IconButton tone="slate">: sus tonos son fijos
                (`slate-100`/`slate-900`) y `cn()` no resuelve conflictos de
                color (ver lib/utils/cn.ts) — mezclar el tono base con un
                override por className dejaria dos clases de color
                compitiendo. La superficie del sidebar usa su propia paleta
                (`--sidebar-*`), asi que un boton propio evita ese choque sin
                agregar un tono nuevo al primitivo compartido por un solo uso.
              */}
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Cerrar menu"
                className={cn(
                  ICON_CONTROL_BASE,
                  settingsMode
                    ? 'text-white hover:bg-white/15 focus-visible:ring-white/70'
                    : 'text-[var(--sidebar-text)] hover:bg-black/5 hover:text-[var(--sidebar-text-strong)] focus-visible:ring-brand-500/60'
                )}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/*
              Version de ancho completo del selector de marca: el
              telefono no tiene lugar para el disparador compacto del
              header (ver el `hidden sm:flex` de MarcaSwitcher), asi que
              vive aca, en el drawer, donde si sobra espacio. Mismo permiso,
              mismos datos — nunca se muestran los dos disparadores a la vez.
            */}
            <MarcaSwitcher marcas={marcas} marcaPreviewId={marcaPreviewId} variant="block" />

            <div className="flex-1 overflow-y-auto p-3">
              {settingsMode ? (
                <SettingsSidebarNav
                  permisos={permisos}
                  onNavigate={() => setDrawerOpen(false)}
                  onOpenSearch={() => {
                    setDrawerOpen(false)
                    setSettingsSearchOpen(true)
                  }}
                />
              ) : (
                <NavLinks permisos={permisos} onNavigate={() => setDrawerOpen(false)} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cuerpo: sidebar + contenido */}
      <div className="flex flex-1">
        <Sidebar
          permisos={permisos}
          empresaNombre={empresaNombre}
          collapsed={!sidebarOpen}
          onOpenSettingsSearch={() => setSettingsSearchOpen(true)}
        />
        {/* Una sola instancia: el drawer y el sidebar pueden estar montados a la vez */}
        {settingsMode && (
          <SettingsSearch
            permisos={permisos}
            open={settingsSearchOpen}
            onOpenChange={setSettingsSearchOpen}
          />
        )}
        {/* key={pathname}: reinicia la animacion de entrada en cada navegacion */}
        <main key={pathname} className="animate-page min-w-0 flex-1 p-4 md:p-6">
          <FormatoHoraProvider formato={formatoHora}>{children}</FormatoHoraProvider>
        </main>
      </div>
    </div>
  )
}
