'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  LogIn,
  Mail,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { loginSchema, type LoginInput } from '@/modules/auth/types'
import { brandConfig, loginScreenContent } from '@/modules/auth/constants'
import { login } from '@/modules/auth/actions/login'

const FEATURES: { key: string; label: string; icon: LucideIcon }[] =
  loginScreenContent.features.map((feature) => ({
    ...feature,
    icon:
      feature.key === 'asistencia' ? CalendarClock : feature.key === 'planillas' ? Banknote : Users,
  }))

const FEATURE_ICON_CLASS = 'text-slate-200 bg-white/10'

const FLOAT_CLASSES = ['animate-float', 'animate-float-delay-1', 'animate-float-delay-2']

const INPUT_CLASSES =
  'w-full pl-10 pr-3 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm placeholder-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-700/25 focus:border-blue-700 transition disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 aria-[invalid=true]:border-rose-400 aria-[invalid=true]:focus:ring-rose-400/60'

export function LoginForm() {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

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
      className="min-h-screen flex flex-col md:flex-row overflow-hidden bg-slate-50 font-sans text-slate-800"
      id="login-screen"
    >
      {/* Panel visual: identidad del sistema, sin sobrecarga de informacion */}
      <section
        className={`md:w-1/2 bg-gradient-to-br ${brandConfig.gradient} p-8 md:p-14 flex min-h-[38vh] md:min-h-screen flex-col justify-between text-white relative overflow-hidden`}
      >
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.04)_1px,transparent_1px)] bg-[size:24px_24px]" />
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 rounded-full bg-slate-500/10 blur-3xl" />

        <div className="relative z-10 flex items-center gap-2.5">
          {/* En el panel oscuro el chip es de vidrio para no perderse con el fondo */}
          <span className="h-9 w-9 rounded-xl flex items-center justify-center text-white font-bold text-lg bg-white/10 ring-1 ring-inset ring-white/20">
            {brandConfig.logo}
          </span>
          <div className="leading-tight">
            <span className="block text-sm font-bold tracking-wide">{brandConfig.systemName}</span>
            <span className="block text-[10px] uppercase tracking-widest text-slate-400">
              {brandConfig.tagline}
            </span>
          </div>
        </div>

        <div className="relative z-10 my-8">
          <h1 className="text-5xl md:text-7xl font-black leading-none tracking-tight bg-gradient-to-b from-white via-white to-slate-400 bg-clip-text text-transparent">
            {loginScreenContent.title}
          </h1>
          <div className="mt-4 h-1 w-16 rounded-full bg-white/25" />
          <p className="text-slate-300 mt-5 text-sm md:text-base max-w-xs leading-relaxed">
            {loginScreenContent.subtitle}
          </p>

          <div className="mt-12 hidden md:flex gap-4">
            {FEATURES.map(({ key, label, icon: Icon }, index) => (
              <div
                key={key}
                className={`flex flex-col items-center gap-2.5 rounded-2xl bg-white/[0.07] backdrop-blur-md border border-white/10 px-6 py-5 shadow-xl shadow-black/10 ${FLOAT_CLASSES[index % FLOAT_CLASSES.length]}`}
              >
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-xl ${FEATURE_ICON_CLASS}`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-xs font-semibold text-slate-200">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 text-[11px] text-slate-500">
          <span>
            (c) {new Date().getFullYear()} {loginScreenContent.copyrightName}
          </span>
        </div>
      </section>

      {/* Panel de acceso */}
      <section className="md:w-1/2 flex items-center justify-center p-6 md:p-16 relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(30,58,138,0.05),transparent_60%)]" />

        <div className="relative w-full max-w-md">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xl shadow-slate-200/60 p-8 md:p-10 space-y-7">
            <div>
              <div className="flex items-center gap-2.5 mb-6">
                <span
                  className={`h-9 w-9 rounded-xl flex items-center justify-center text-white font-bold text-lg ${brandConfig.accent}`}
                >
                  {brandConfig.logo}
                </span>
                <div className="leading-tight">
                  <h2 className="text-lg font-extrabold text-slate-900">
                    {brandConfig.systemName}
                  </h2>
                  <p className="text-[11px] text-slate-500">{brandConfig.tagline}</p>
                </div>
              </div>
              <h3 className="text-2xl font-black text-slate-900">Bienvenido de nuevo</h3>
              <p className="text-slate-500 text-sm mt-1.5">
                Ingrese con las credenciales asignadas por administracion.
              </p>
            </div>

            {serverError && (
              <div
                role="alert"
                className="bg-rose-50 border border-rose-200 p-3.5 text-xs text-rose-800 rounded-xl flex gap-2.5 items-start"
              >
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500 mt-0.5" />
                <div>{serverError}</div>
              </div>
            )}

            {/* method="post": si el form se envia antes de que React hidrate,
                las credenciales van en el body y nunca en la URL */}
            <form onSubmit={handleSubmit(onSubmit)} method="post" className="space-y-5" noValidate>
              <div>
                <label
                  className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1.5"
                  htmlFor="email-input"
                >
                  Correo Electronico
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                  <input
                    type="email"
                    id="email-input"
                    autoComplete="email"
                    disabled={isSubmitting}
                    aria-invalid={!!errors.email}
                    {...register('email')}
                    className={INPUT_CLASSES}
                    placeholder="correo@sucursal.com"
                  />
                </div>
                {errors.email && (
                  <p className="mt-1.5 text-xs text-rose-600">{errors.email.message}</p>
                )}
              </div>

              <div>
                <label
                  className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1.5"
                  htmlFor="pass-input"
                >
                  Contrasena
                </label>
                <div className="relative">
                  <LockKeyhole className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="pass-input"
                    autoComplete="current-password"
                    disabled={isSubmitting}
                    aria-invalid={!!errors.password}
                    {...register('password')}
                    className={`${INPUT_CLASSES} pr-11`}
                    placeholder="********"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    disabled={isSubmitting}
                    aria-label={showPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
                    className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 hover:text-slate-600 transition disabled:cursor-not-allowed"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="mt-1.5 text-xs text-rose-600">{errors.password.message}</p>
                )}
              </div>

              <button
                type="submit"
                id="submit-login"
                disabled={isSubmitting}
                className={`w-full py-3.5 rounded-xl text-white font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-700/20 hover:shadow-blue-700/30 active:scale-[0.99] ${brandConfig.accent} ${brandConfig.accentHover} disabled:cursor-not-allowed disabled:bg-slate-400 disabled:shadow-none`}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Validando acceso
                  </>
                ) : (
                  <>
                    <LogIn className="h-4 w-4" /> Iniciar sesion
                  </>
                )}
              </button>
            </form>
          </div>

          <p className="text-center text-xs text-slate-400 mt-6">
            Dificultades de ingreso? Contacte al soporte interno de TI.
          </p>
        </div>
      </section>
    </main>
  )
}
