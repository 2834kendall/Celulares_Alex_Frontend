import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layout/Sidebar'
import { LogoutButton } from '@/modules/auth/components/LogoutButton'
import type { SgrhJwtClaims } from '@/types/auth'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()

  // Capa 1: sin sesion valida no se entra al edificio
  if (error || !data?.claims) {
    redirect('/login')
  }

  // Capa 2: sesion sin permisos no ve el dashboard (mismo criterio que el login)
  const meta = (data.claims.app_metadata ?? {}) as Partial<SgrhJwtClaims>
  const permisos = Array.isArray(meta.permisos) ? meta.permisos : []

  if (permisos.length === 0) {
    redirect('/unauthorized')
  }

  const email = typeof data.claims.email === 'string' ? data.claims.email : 'Usuario autenticado'
  const rol = typeof meta.rol === 'string' ? meta.rol : null

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      <Sidebar permisos={permisos} />

      <div className="flex-1 flex flex-col">
        <header className="h-16 border-b border-slate-200 bg-white px-4 flex items-center justify-between">
          <span className="font-semibold">Celulares Alex</span>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm text-slate-700 leading-tight">{email}</p>
              {rol && (
                <p className="text-[11px] font-semibold uppercase text-slate-400 leading-tight">
                  {rol}
                </p>
              )}
            </div>
            <LogoutButton />
          </div>
        </header>
        <main className="flex-1 p-4">{children}</main>
      </div>
    </div>
  )
}
