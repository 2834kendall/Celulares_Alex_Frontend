import { LogoutButton } from '@/modules/auth/components/LogoutButton'

/**
 * Grupo de rutas del kiosco: NO monta AppShell (sin sidebar/topbar). Pensado
 * para una tablet compartida en la sucursal — pantalla completa, tema oscuro,
 * sin nada de navegacion administrativa.
 *
 * El unico control fuera de la pantalla de marcado es cerrar sesion, arriba a
 * la derecha: la tablet queda con sesion permanente, y hasta ahora la unica
 * forma de salir era borrar las cookies del navegador.
 */
export default function KioskLayout({ children }: { children: React.ReactNode }) {
  return (
    // min-h-dvh y no min-h-screen: en la tablet la barra del navegador se
    // retrae, y `screen` mide siempre contra el viewport mas grande.
    // El kiosco usa la MISMA superficie que el resto de la app (clara, acento
    // `brand`) y no un tema oscuro propio: antes era la unica pantalla con su
    // paleta aparte, y encima montaba controles claros del admin encima de un
    // fondo casi negro, que es lo que la hacia sentir de otro sistema.
    <div className="relative flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10 text-foreground">
      {/*
        Esquina superior derecha, deliberadamente discreto y lejos de los
        botones de marcado: lo usa el encargado al cerrar la sucursal, no el
        empleado que viene a marcar. El area tocable llega a 44px (WCAG
        2.5.5) porque esto SIEMPRE se opera con el dedo.
      */}
      <div className="absolute right-3 top-3 z-10">
        <LogoutButton className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-xs font-semibold text-slate-500 transition hover:bg-white hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/40 disabled:cursor-not-allowed disabled:opacity-60" />
      </div>

      {children}
    </div>
  )
}
