import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/layout/AppShell'
import { getEmpresaNombre } from '@/lib/empresa/get-empresa-nombre'
import { resolveShellTheme } from '@/lib/empresa/resolve-shell-theme'
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

  // Capa 3: el kiosco NUNCA monta el shell administrativo. No basta con el
  // chequeo de arriba — KIOSCO tiene permisos (marca asistencia, lee su
  // sucursal), asi que pasaba el filtro y la tablet compartida terminaba
  // mostrando sidebar, banner y navegacion. El proxy ya lo desvia; esto es la
  // red de seguridad por si alguien alcanza este layout por otra via.
  if (meta.rol === 'KIOSCO') {
    redirect('/kiosco')
  }

  const email = typeof data.claims.email === 'string' ? data.claims.email : 'Usuario autenticado'
  const rol = typeof meta.rol === 'string' ? meta.rol : null

  // Nombre real de la empresa del tenant (RLS devuelve solo la del JWT) y el
  // tema oficial del shell — sucursal fija propia, salvo que haya una
  // sucursal en preview desde el selector de la barra superior.
  const [empresaNombre, theme] = await Promise.all([
    getEmpresaNombre(),
    resolveShellTheme(meta.usr_id, permisos),
  ])

  return (
    <AppShell
      permisos={permisos}
      email={email}
      rol={rol}
      empresaNombre={empresaNombre}
      sucursalNombre={theme.sucursalNombre}
      colorAcento={theme.colorAcento}
      colorSidebar={theme.colorSidebar}
      sucursales={theme.sucursales}
      sucursalPreviewId={theme.sucursalPreviewId}
    >
      {children}
    </AppShell>
  )
}
