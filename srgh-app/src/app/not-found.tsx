import Link from 'next/link'
import { Compass } from 'lucide-react'
import { AUTH_SUBMIT, SubmitSheen } from '@/modules/auth/components/AuthShell'
import { PublicStateScreen } from '@/modules/auth/components/PublicStateScreen'

/**
 * 404 general: direcciones que no existen y `notFound()` fuera del dashboard
 * (comprobantes). Los del dashboard tienen el suyo, dentro de la app.
 * "Ir al inicio" sin sesión termina en /login: lo resuelve el proxy.
 */
export default function NotFound() {
  return (
    <PublicStateScreen
      kind="not-found"
      badge={<Compass className="h-6 w-6" />}
      title="Página no encontrada"
      description="La dirección no existe o cambió. Revise el enlace o vuelva al inicio."
    >
      <Link href="/dashboard" className={AUTH_SUBMIT}>
        <SubmitSheen />
        Ir al inicio
      </Link>
    </PublicStateScreen>
  )
}
