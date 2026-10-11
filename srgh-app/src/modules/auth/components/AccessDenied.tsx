import Link from 'next/link'
import { ArrowLeft, LogIn, ShieldX } from 'lucide-react'
import { AUTH_SUBMIT, SubmitSheen } from '@/modules/auth/components/AuthShell'
import { LogoutButton } from '@/modules/auth/components/LogoutButton'
import { PublicStateScreen } from '@/modules/auth/components/PublicStateScreen'
import type { AccessExit } from '@/modules/auth/lib/accessExit'

/* Salida secundaria: mismo tamaño que AUTH_SUBMIT, sin relleno. */
const AUTH_SECONDARY =
  'flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60 auth-short:py-2.5'

const DESCRIPTION: Record<AccessExit, string> = {
  home: 'Su usuario no tiene permiso para ver esta sección. Si lo necesita, pídalo a un administrador.',
  logout:
    'Su usuario todavía no tiene permisos asignados en el sistema. Pida a un administrador que se los asigne.',
  login: 'Su sesión no está activa. Inicie sesión para continuar.',
}

/**
 * Pantalla de "acceso no autorizado", con el guardia de las escenas de
 * estado. Lo que ofrece depende de quién llega (ver accessExit).
 */
export function AccessDenied({ exit }: { exit: AccessExit }) {
  return (
    <PublicStateScreen
      kind="forbidden"
      badge={<ShieldX className="h-6 w-6" />}
      title="Acceso no autorizado"
      description={DESCRIPTION[exit]}
    >
      {exit === 'home' && (
        <>
          <Link href="/dashboard" className={AUTH_SUBMIT}>
            <SubmitSheen />
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Volver al inicio
          </Link>
          <LogoutButton label="Cerrar sesión" className={AUTH_SECONDARY} />
        </>
      )}
      {exit === 'logout' && (
        <LogoutButton label="Volver al inicio de sesión" className={AUTH_SUBMIT} />
      )}
      {exit === 'login' && (
        <Link href="/login" className={AUTH_SUBMIT}>
          <SubmitSheen />
          <LogIn className="h-4 w-4" aria-hidden="true" />
          Iniciar sesión
        </Link>
      )}
    </PublicStateScreen>
  )
}
