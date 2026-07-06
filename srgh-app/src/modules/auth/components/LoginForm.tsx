'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, CheckCircle, Loader2, Smartphone } from 'lucide-react'
import { loginSchema, type LoginInput } from '@/modules/auth/types'
import { companyConfig, loginScreenContent } from '@/modules/auth/constants'
import { login } from '@/modules/auth/actions/login'

export function LoginForm() {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  async function onSubmit(input: LoginInput) {
    setServerError(null)

    try {
      // Server Action: la autenticacion corre en el servidor,
      // el token nunca pasa por el JavaScript del navegador.
      const result = await login(input)

      if (!result.ok) {
        setServerError(result.error)
        return
      }

      router.replace(result.destination)
      router.refresh()
    } catch {
      setServerError(
        'No se pudo conectar con el servicio de autenticacion. Revise la conexion e intente de nuevo.'
      )
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
          style={{ backgroundImage: `url('${loginScreenContent.backgroundImageUrl}')` }}
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.05)_1px,transparent_1px)] bg-[size:20px_20px]" />
        <div className="absolute top-1/4 -right-20 w-80 h-80 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="absolute bottom-1/4 -left-20 w-80 h-80 rounded-full bg-cyan-500/10 blur-3xl" />

        <div className="relative z-10">
          <span className="text-xs bg-white/15 backdrop-blur-md text-white font-bold px-3 py-1.5 rounded-full uppercase border border-white/25">
            {loginScreenContent.badge}
          </span>
          <h1 className="text-3xl md:text-5xl font-black mt-8 leading-none text-white font-sans">
            {loginScreenContent.title}
          </h1>
          <p className="text-slate-300 mt-2 text-sm max-w-sm">{loginScreenContent.description}</p>
        </div>

        <div className="relative z-10 my-10 hidden md:block">
          <blockquote className="border-l-4 border-emerald-500 pl-4 py-1 italic text-slate-300 text-sm">
            &quot;{loginScreenContent.quote}&quot;
          </blockquote>
          <div className="mt-4 flex items-center gap-3">
            <div className="p-2.5 bg-white/10 backdrop-blur rounded-lg">
              <Smartphone className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-white text-xs font-bold leading-tight">
                {loginScreenContent.organization}
              </p>
              <p className="text-slate-400 text-[10px]">{loginScreenContent.organizationDetail}</p>
            </div>
          </div>
        </div>

        <div className="relative z-10 text-[11px] text-slate-400 flex justify-between gap-4">
          <span>
            (c) {new Date().getFullYear()} {loginScreenContent.copyrightName}
          </span>
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

          {serverError && (
            <div
              role="alert"
              className="bg-rose-50 border-l-4 border-rose-600 p-3 text-xs text-rose-800 rounded flex gap-2"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
              <div>{serverError}</div>
            </div>
          )}

          {/* method="post": si el form se envia antes de que React hidrate,
              las credenciales van en el body y nunca en la URL */}
          <form onSubmit={handleSubmit(onSubmit)} method="post" className="space-y-4" noValidate>
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
                  disabled={isSubmitting}
                  aria-invalid={!!errors.email}
                  {...register('email')}
                  className="w-full pl-8 pr-3 py-2.5 rounded-lg border border-slate-300 text-slate-800 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 aria-[invalid=true]:border-rose-500"
                  placeholder="correo@sucursal.com"
                />
              </div>
              {errors.email && <p className="mt-1 text-xs text-rose-600">{errors.email.message}</p>}
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
                disabled={isSubmitting}
                aria-invalid={!!errors.password}
                {...register('password')}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 aria-[invalid=true]:border-rose-500"
                placeholder="********"
              />
              {errors.password && (
                <p className="mt-1 text-xs text-rose-600">{errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              id="submit-login"
              disabled={isSubmitting}
              className={`w-full py-3 rounded-lg text-white font-bold text-sm transition shadow-md flex items-center justify-center gap-2 ${companyConfig.accent} ${companyConfig.accentHover} disabled:cursor-not-allowed disabled:bg-slate-400 disabled:shadow-none`}
            >
              {isSubmitting ? (
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
