/**
 * Grupo de rutas del kiosco: NO monta AppShell (sin sidebar/topbar). Pensado
 * para una tablet compartida en la sucursal — pantalla completa, tema oscuro,
 * sin nada de navegacion administrativa.
 */
export default function KioskLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 py-10 text-white">
      {children}
    </div>
  )
}
