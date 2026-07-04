'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle, Loader2, Smartphone } from 'lucide-react'
import type { AuthError } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

const companyConfig = {
  name: 'Celulares Alex',
  tagline: 'Talento, asistencia y planillas',
  logo: 'C',
  accent: 'bg-[#D97706]',
  accentHover: 'hover:bg-[#B45309]',
  gradient: 'from-[#1E3A8A] via-indigo-900 to-amber-950',
}

function getLoginMessage(error: AuthError) {
  const message = error.message.toLowerCase()

  if (error.status === 429 || error.code === 'over_request_rate_limit') {
    return 'Demasiados intentos. Espere un momento antes de volver a intentar.'
  }

  if (error.code === 'email_not_confirmed' || message.includes('email not confirmed')) {
    return 'No se pudo completar el acceso. Confirme su correo o contacte al administrador.'
  }

  if (message.includes('failed to fetch') || message.includes('network')) {
    return 'No se pudo conectar con el servicio de autenticacion. Revise la conexion e intente de nuevo.'
  }

  return 'Credenciales invalidas.'
}

export default function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const cleanEmail = email.trim().toLowerCase()

    if (!cleanEmail || !password.trim()) {
      setError('Complete todos los campos de acceso requeridos.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      })

      if (loginError) {
        setError(getLoginMessage(loginError))
        return
      }

      const permisos = data.user?.app_metadata?.permisos

      if (!Array.isArray(permisos) || permisos.length === 0) {
        router.replace('/unauthorized')
        router.refresh()
        return
      }

      router.replace('/dashboard')
      router.refresh()
    } catch {
      setError(
        'No se pudo conectar con el servicio de autenticacion. Revise la conexion e intente de nuevo.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <main
      className="min-h-screen flex flex-col md:flex-row overflow-hidden bg-[#F8FAFC] font-sans text-slate-800"
      id="login-screen"
    >
      <section
        className={`md:w-1/2 bg-gradient-to-b ${companyConfig.gradient} p-8 md:p-16 flex min-h-[44vh] md:min-h-screen flex-col justify-between text-white relative overflow-hidden`}
      >
        <div
          className="absolute inset-0 bg-cover bg-center opacity-15 blur-[2px] pointer-events-none mix-blend-overlay"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&q=80&w=800')",
          }}
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.05)_1px,transparent_1px)] bg-[size:20px_20px]" />
        <div className="absolute top-1/4 -right-20 w-80 h-80 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="absolute bottom-1/4 -left-20 w-80 h-80 rounded-full bg-cyan-500/10 blur-3xl" />

        <div className="relative z-10">
          <span className="text-xs bg-white/15 backdrop-blur-md text-white font-bold px-3 py-1.5 rounded-full uppercase border border-white/25">
            SGRH - Talento & Planillas v3.5
          </span>
          <h1 className="text-3xl md:text-5xl font-black mt-8 leading-none text-white font-sans">
            SGRH
          </h1>
          <p className="text-slate-300 mt-2 text-sm max-w-sm">
            Sistema de Gestion de Recursos Humanos. Control de asistencia inteligente, calculo
            exacto de planillas Costarricenses (CCSS) y expedientes digitales.
          </p>
        </div>

        <div className="relative z-10 my-10 hidden md:block">
          <blockquote className="border-l-4 border-emerald-500 pl-4 py-1 italic text-slate-300 text-sm">
            &quot;La solucion de recursos humanos unificada para el retail de mayor movimiento
            tecnologico en el pais.&quot;
          </blockquote>
          <div className="mt-4 flex items-center gap-3">
            <div className="p-2.5 bg-white/10 backdrop-blur rounded-lg">
              <Smartphone className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-white text-xs font-bold leading-tight">
                Infinity CR & Celulares Alex
              </p>
              <p className="text-slate-400 text-[10px]">
                Un solo ecosistema operativo para 12 tiendas pais
              </p>
            </div>
          </div>
        </div>

        <div className="relative z-10 text-[11px] text-slate-400 flex justify-between gap-4">
          <span>(c) {new Date().getFullYear()} SGRH Hub Costa Rica</span>
          <span>ISO 9241 & W3C Compliant</span>
        </div>
      </section>

      <section className="md:w-1/2 bg-white flex items-center justify-center p-8 md:p-16">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-2 mb-3">
              <span
                className={`h-8 w-8 rounded-lg flex items-center justify-center text-white font-bold text-lg ${companyConfig.accent}`}
              >
                {companyConfig.logo}
              </span>
              <div>
                <h2 className="text-xl font-bold text-slate-900">{companyConfig.name}</h2>
                <p className="text-xs text-slate-500">{companyConfig.tagline}</p>
              </div>
            </div>
            <h3 className="text-2xl font-black text-slate-900">Acceso Integrado</h3>
            <p className="text-slate-500 text-sm mt-1">
              Ingrese con las credenciales asignadas por administracion.
            </p>
          </div>

          {error && (
            <div className="bg-rose-50 border-l-4 border-rose-600 p-3 text-xs text-rose-800 rounded flex gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
              <div>{error}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                className="block text-xs font-semibold uppercase text-slate-600 mb-1"
                htmlFor="email-input"
              >
                Correo Electronico
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                  @
                </span>
                <input
                  type="email"
                  id="email-input"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={loading}
                  className="w-full pl-8 pr-3 py-2.5 rounded-lg border border-slate-300 text-slate-800 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                  placeholder="correo@sucursal.com"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label
                  className="block text-xs font-semibold uppercase text-slate-600"
                  htmlFor="pass-input"
                >
                  Contrasena
                </label>
                <span className="text-xs text-blue-600">Olvido la contrasena?</span>
              </div>
              <input
                type="password"
                id="pass-input"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={loading}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                placeholder="********"
              />
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="remember"
                defaultChecked
                disabled={loading}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed"
              />
              <label
                htmlFor="remember"
                className="ml-2 text-xs text-slate-500 font-medium select-none"
              >
                Mantener sesion iniciada en este navegador (Tienda)
              </label>
            </div>

            <button
              type="submit"
              id="submit-login"
              disabled={loading}
              className={`w-full py-3 rounded-lg text-white font-bold text-sm transition shadow-md flex items-center justify-center gap-2 ${companyConfig.accent} ${companyConfig.accentHover} disabled:cursor-not-allowed disabled:bg-slate-400 disabled:shadow-none`}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Validando acceso
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4" /> Autenticar Credenciales
                </>
              )}
            </button>
          </form>

          <div className="border-t border-slate-200 pt-5 text-center">
            <p className="text-xs text-slate-500">Dificultades de ingreso?</p>
            <p className="text-[10px] text-slate-400 mt-1">
              Contacte al soporte interno de TI o al administrador del sistema.
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}
