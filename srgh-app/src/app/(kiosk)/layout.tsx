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
    // Blanco con un degradado azul suave (SGRH-88): el kiosco usa un acento
    // azul fijo, no el color de la sucursal, porque es la pantalla que usa
    // todo el personal de pasada y tiene que leerse igual en cualquier tienda.
    //
    // Sin justify-center: el hijo se centra con my-auto, que en un telefono
    // acostado deja desplazar en vez de cortar el contenido por arriba.
    <div className="relative flex min-h-dvh flex-col items-center bg-gradient-to-b from-blue-50 via-white to-white px-4 pb-8 pt-16 text-slate-900 sm:px-6">
      {/*
        Esquina superior derecha, deliberadamente discreto y lejos de los
        botones de marcado: lo usa el encargado al cerrar la sucursal, no el
        empleado que viene a marcar. El area tocable llega a 44px (WCAG
        2.5.5) porque esto SIEMPRE se opera con el dedo.
      */}
      <div className="absolute right-3 top-3 z-10">
        <LogoutButton className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-blue-100 bg-white/80 px-3 py-2 text-xs font-semibold text-slate-500 transition hover:bg-white hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-60" />
      </div>

      {children}
    </div>
  )
}
