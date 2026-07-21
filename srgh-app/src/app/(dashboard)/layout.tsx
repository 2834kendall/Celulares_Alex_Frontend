import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/layout/AppShell'
import { getEmpresaNombre } from '@/lib/empresa/get-empresa-nombre'
import { getSucursalActual } from '@/lib/empresa/get-sucursal-actual'
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

  // Nombre real de la empresa del tenant (RLS devuelve solo la del JWT) y,
  // si el usuario tiene una sucursal fija asignada, su nombre también.
  const [empresaNombre, sucursalNombre] = await Promise.all([
    getEmpresaNombre(),
    getSucursalActual(meta.usr_id),
  ])

  return (
    <AppShell
      permisos={permisos}
      email={email}
      rol={rol}
      empresaNombre={empresaNombre}
      sucursalNombre={sucursalNombre}
    >
      {children}
    </AppShell>
  )
}
