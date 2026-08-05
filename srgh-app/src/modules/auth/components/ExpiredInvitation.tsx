import Link from 'next/link'
import { MailX } from 'lucide-react'
import { brandConfig } from '@/modules/auth/constants'

/** Estado terminal de /activate-account cuando el enlace no trajo sesión. */
export function ExpiredInvitation() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6 font-sans text-slate-800">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-xl shadow-slate-200/60 md:p-10">
        <div className="flex items-center justify-center gap-2.5">
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-xl text-lg font-bold text-white ${brandConfig.accent}`}
          >
            {brandConfig.logo}
          </span>
          <div className="text-left leading-tight">
            <h2 className="text-lg font-extrabold text-slate-900">{brandConfig.systemName}</h2>
            <p className="text-[11px] text-slate-500">{brandConfig.tagline}</p>
          </div>
        </div>

        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-500">
            <MailX className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-black text-slate-900">Enlace inválido o vencido</h1>
          <p className="text-sm leading-relaxed text-slate-500">
            El enlace de la invitación ya no es válido. Solicite a la persona administradora que le
            reenvíe la invitación desde la sección de usuarios.
          </p>
        </div>

        <Link
          href="/login"
          className={`inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-700/20 transition-all hover:shadow-blue-700/30 active:scale-[0.99] ${brandConfig.accent} ${brandConfig.accentHover}`}
        >
          Ir a iniciar sesión
        </Link>
      </div>
    </main>
  )
}
