'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, ArrowLeft, Loader2, Mail, MailCheck, Send } from 'lucide-react'
import { forgotPasswordSchema, type ForgotPasswordInput } from '@/modules/auth/types'
import { brandConfig } from '@/modules/auth/constants'
import { requestPasswordReset } from '@/modules/auth/actions/requestPasswordReset'
import { cn } from '@/lib/utils/cn'
import { FIELD_ERROR, INPUT } from '@/components/ui/styles'

/**
 * Entrada de la recuperación: se pide el correo y se dispara el enlace.
 *
 * El acuse NUNCA confirma que la cuenta exista — es la contraparte de la
 * acción, que responde igual para un correo real y uno inventado. Si esta
 * pantalla distinguiera los dos casos, el formulario (que es público) se
 * volvería un verificador de los correos de la empresa.
 */
export function ForgotPasswordForm() {
  const [serverError, setServerError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  })

  async function onSubmit(input: ForgotPasswordInput) {
    setServerError(null)

    try {
      const result = await requestPasswordReset(input)

      if (!result.ok) {
        setServerError(result.error)
        return
      }

      // El resolver ya aplicó trim + minúsculas del esquema.
      setSentTo(input.email)
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
          <div className="flex items-center gap-2.5">
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

          {sentTo ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <MailCheck className="h-6 w-6" />
              </div>
              <h3 className="text-2xl font-black text-slate-900">Revise su correo</h3>
              <p className="text-sm leading-relaxed text-slate-500">
                Le hemos enviado un enlace para restablecer la contraseña. El enlace vence en una
                hora y solo puede usarse una vez.
              </p>
              <p className="text-xs leading-relaxed text-slate-400">
                ¿No llegó? Revise la carpeta de correo no deseado antes de volver a intentar.
              </p>
            </div>
          ) : (
            <>
              <div>
                <h3 className="text-2xl font-black text-slate-900">¿Olvidó su contraseña?</h3>
                <p className="mt-1.5 text-sm text-slate-500">
                  Escriba el correo de su cuenta y le enviaremos un enlace para definir una nueva.
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

              <form
                onSubmit={handleSubmit(onSubmit)}
                method="post"
                className="space-y-5"
                noValidate
              >
                <div>
                  <label
                    className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600"
                    htmlFor="recovery-email-input"
                  >
                    Correo electrónico
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="email"
                      id="recovery-email-input"
                      autoComplete="email"
                      disabled={isSubmitting}
                      aria-invalid={!!errors.email}
                      {...register('email')}
                      className={cn(INPUT, 'py-3 pl-10')}
                      placeholder="correo@sucursal.com"
                    />
                  </div>
                  {errors.email && <p className={FIELD_ERROR}>{errors.email.message}</p>}
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-white shadow-lg shadow-brand-700/20 transition-all hover:shadow-brand-700/30 active:scale-[0.99] ${brandConfig.accent} ${brandConfig.accentHover} disabled:cursor-not-allowed disabled:bg-slate-400 disabled:shadow-none`}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Enviando enlace
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" /> Enviar enlace de recuperación
                    </>
                  )}
                </button>
              </form>
            </>
          )}

          <Link
            href="/login"
            className="flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-slate-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Volver a iniciar sesión
          </Link>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          ¿Sigue sin poder ingresar? Contacte al soporte interno de TI.
        </p>
      </div>
    </main>
  )
}
