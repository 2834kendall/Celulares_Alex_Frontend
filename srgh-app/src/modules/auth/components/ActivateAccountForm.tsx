'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, Eye, EyeOff, KeyRound, Loader2, LockKeyhole } from 'lucide-react'
import { activateAccountSchema, type ActivateAccountInput } from '@/modules/auth/types'
import { brandConfig } from '@/modules/auth/constants'
import { activateAccount } from '@/modules/auth/actions/activateAccount'
import { cn } from '@/lib/utils/cn'
import { FIELD_ERROR, INPUT } from '@/components/ui/styles'

interface ActivateAccountFormProps {
  /** Email de la cuenta invitada (sale de la sesión, solo informativo). */
  email: string
}

/**
 * Primer acceso tras la invitación: la sesión ya existe (la estableció
 * /auth/confirm), aquí la persona define su contraseña y entra al sistema.
 */
export function ActivateAccountForm({ email }: ActivateAccountFormProps) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ActivateAccountInput>({
    resolver: zodResolver(activateAccountSchema),
    defaultValues: { password: '', confirmPassword: '' },
  })

  async function onSubmit(input: ActivateAccountInput) {
    setServerError(null)

    try {
      const result = await activateAccount(input)

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
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6 font-sans text-slate-800">
      <div className="w-full max-w-md">
        <div className="space-y-7 rounded-2xl border border-slate-100 bg-white p-8 shadow-xl shadow-slate-200/60 md:p-10">
          <div>
            <div className="mb-6 flex items-center gap-2.5">
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-xl text-lg font-bold text-white ${brandConfig.accent}`}
              >
                {brandConfig.logo}
              </span>
              <div className="leading-tight">
                <h2 className="text-lg font-extrabold text-slate-900">{brandConfig.systemName}</h2>
                <p className="text-[11px] text-slate-500">{brandConfig.tagline}</p>
              </div>
            </div>
            <h3 className="text-2xl font-black text-slate-900">Activa tu cuenta</h3>
            <p className="mt-1.5 text-sm text-slate-500">
              Define la contraseña con la que ingresarás
              {email ? (
                <>
                  {' '}
                  como <span className="font-semibold text-slate-700">{email}</span>
                </>
              ) : null}
              .
            </p>
          </div>

          {serverError && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
              <div>{serverError}</div>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} method="post" className="space-y-5" noValidate>
            <div>
              <label
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600"
                htmlFor="new-password-input"
              >
                Nueva contraseña
              </label>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="new-password-input"
                  autoComplete="new-password"
                  disabled={isSubmitting}
                  aria-invalid={!!errors.password}
                  {...register('password')}
                  className={cn(INPUT, 'py-3 pl-10 pr-11')}
                  placeholder="Mínimo 8 caracteres"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  disabled={isSubmitting}
                  aria-label={showPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
                  className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 transition hover:text-slate-600 disabled:cursor-not-allowed"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className={FIELD_ERROR}>{errors.password.message}</p>}
            </div>

            <div>
              <label
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600"
                htmlFor="confirm-password-input"
              >
                Confirmar contraseña
              </label>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="confirm-password-input"
                  autoComplete="new-password"
                  disabled={isSubmitting}
                  aria-invalid={!!errors.confirmPassword}
                  {...register('confirmPassword')}
                  className={cn(INPUT, 'py-3 pl-10')}
                  placeholder="Repite la contraseña"
                />
              </div>
              {errors.confirmPassword && (
                <p className={FIELD_ERROR}>{errors.confirmPassword.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className={`flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-700/20 transition-all hover:shadow-blue-700/30 active:scale-[0.99] ${brandConfig.accent} ${brandConfig.accentHover} disabled:cursor-not-allowed disabled:bg-slate-400 disabled:shadow-none`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Guardando contraseña
                </>
              ) : (
                <>
                  <KeyRound className="h-4 w-4" /> Activar cuenta
                </>
              )}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          ¿Dificultades con la activación? Contacte al soporte interno de TI.
        </p>
      </div>
    </main>
  )
}
