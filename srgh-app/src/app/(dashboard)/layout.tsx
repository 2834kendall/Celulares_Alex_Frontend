import { Fragment } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/layout/AppShell'
import { getEmpresaNombre } from '@/lib/empresa/get-empresa-nombre'
import { resolveShellTheme } from '@/lib/empresa/resolve-shell-theme'
import { getFormatoHora } from '@/lib/empresa/get-formato-hora'
import { getEmpresaLogoUrl } from '@/lib/empresa/get-empresa-logo'
import { getRolNombre } from '@/lib/empresa/get-rol-nombre'
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

  // Nombre real de la empresa del tenant (RLS devuelve solo la del JWT) y el
  // tema oficial del shell — la marca elegida en el selector de la barra superior
  // o, sin selector, la propia (sucursal de la cuenta o del contrato vigente); sin
  // marca, el tema de la empresa. El rol se muestra por su nombre: el código del
  // JWT es un identificador, no un texto.
  const [empresaNombre, theme, formatoHora, rol] = await Promise.all([
    getEmpresaNombre(),
    resolveShellTheme(meta.usr_id, meta.emp_id),
    getFormatoHora(),
    getRolNombre(typeof meta.rol === 'string' ? meta.rol : null),
  ])
  // Depende de la marca resuelta: el logo de la marca, o el de la empresa.
  const logoUrl = await getEmpresaLogoUrl(theme.logoPath)

  return (
    <AppShell
      permisos={permisos}
      email={email}
      rol={rol}
      empresaNombre={empresaNombre}
      logoUrl={logoUrl}
      marcaNombre={theme.marcaNombre}
      sucursalNombre={theme.sucursalNombre}
      colorAcento={theme.colorAcento}
      colorSidebar={theme.colorSidebar}
      marcas={theme.marcas}
      marcaContextoId={theme.marcaContextoId}
      formatoHora={formatoHora}
    >
      {/* Al cambiar de marca se vuelve a montar la página: un filtro o una selección
          en estado de cliente no pueden quedar con datos de la marca anterior. */}
      <Fragment key={theme.marcaContextoId ?? 'todas'}>{children}</Fragment>
    </AppShell>
  )
}
