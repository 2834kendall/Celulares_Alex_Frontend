'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, ArrowLeft, KeyRound, Loader2, Mail, MailCheck, Send } from 'lucide-react'
import { forgotPasswordSchema, type ForgotPasswordInput } from '@/modules/auth/types'
import { requestPasswordReset } from '@/modules/auth/actions/requestPasswordReset'
import {
  AUTH_FIELD_ICON,
  AUTH_FIELD_LABEL,
  AUTH_INPUT,
  AUTH_SUBMIT,
  AUTH_TITLE,
  AuthBadge,
  AuthShell,
  SubmitSheen,
  enterStep,
} from '@/modules/auth/components/AuthShell'
import { RecoveryScene, type RecoverySceneMood } from '@/modules/auth/components/RecoveryScene'
import { useTypingSignal } from '@/modules/auth/components/useTypingSignal'
import { cn } from '@/lib/utils/cn'
import { FIELD_ERROR, INPUT } from '@/components/ui/styles'

/* How long the envelope stays upset after a failed attempt. */
const ERROR_MOOD_MS = 1600

/**
 * Entrada de la recuperación: se pide el correo y se dispara el enlace.
 *
 * El acuse NUNCA confirma que la cuenta exista — es la contraparte de la
 * acción, que responde igual para un correo real y uno inventado. Si esta
 * pantalla distinguiera los dos casos, el formulario (que es público) se
 * volvería un verificador de los correos de la empresa. Vale tambien para la
 * escena: el sobre sale volando igual en los dos casos.
 */
export function ForgotPasswordForm() {
  const [serverError, setServerError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [emailFocused, setEmailFocused] = useState(false)
  const [errorPulse, setErrorPulse] = useState(false)
  const [typing, signalTyping] = useTypingSignal()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  })

  const emailField = register('email')

  useEffect(() => {
    if (!errorPulse) return
    const timeout = setTimeout(() => setErrorPulse(false), ERROR_MOOD_MS)
    return () => clearTimeout(timeout)
  }, [errorPulse])

  let mood: RecoverySceneMood = 'idle'
  if (sentTo) mood = 'sent'
  else if (isSubmitting) mood = 'loading'
  else if (errorPulse) mood = 'error'
  else if (emailFocused) mood = 'watching'

  async function onSubmit(input: ForgotPasswordInput) {
    setServerError(null)

    try {
      const result = await requestPasswordReset(input)

      if (!result.ok) {
        setServerError(result.error)
        setErrorPulse(true)
        return
      }

      // El resolver ya aplicó trim + minúsculas del esquema.
      setSentTo(input.email)
    } catch {
      setServerError(
        'No se pudo conectar con el servicio de autenticacion. Revise la conexion e intente de nuevo.'
      )
      setErrorPulse(true)
    }
  }

  return (
    <AuthShell scene={<RecoveryScene mood={mood} typing={typing} />}>
      {sentTo ? (
        <>
          <div className="login-enter" style={enterStep(0)}>
            <AuthBadge>
              <MailCheck className="h-6 w-6" />
            </AuthBadge>
            <h2 className={AUTH_TITLE}>Revise su correo</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-500 auth-short:mt-1">
              Le enviamos un enlace para restablecer la contraseña. Vence en una hora y solo puede
              usarse una vez.
            </p>
            <p className="mt-3 rounded-xl bg-brand-50 px-3.5 py-2.5 text-xs leading-relaxed text-slate-600 auth-short:mt-2">
              ¿No llegó? Revise la carpeta de correo no deseado.
            </p>
          </div>

          <div className="login-enter" style={enterStep(1)}>
            <Link href="/login" className={AUTH_SUBMIT}>
              <SubmitSheen />
              <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-1" />
              Volver a iniciar sesión
            </Link>
          </div>
        </>
      ) : (
        <>
          <div className="login-enter" style={enterStep(0)}>
            <AuthBadge>
              <KeyRound className="h-6 w-6" />
            </AuthBadge>
            <h2 className={AUTH_TITLE}>¿Olvidó su contraseña?</h2>
            <p className="mt-1.5 text-sm text-slate-500 auth-short:mt-1 auth-short:text-xs">
              Le enviaremos un enlace para definir una nueva.
            </p>
          </div>

          {serverError && (
            <div
              role="alert"
              className="login-alert flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
              <div>{serverError}</div>
            </div>
          )}

          <form
            onSubmit={handleSubmit(onSubmit, () => setErrorPulse(true))}
            method="post"
            className="space-y-4 auth-wide:space-y-5 auth-short:space-y-3"
            noValidate
          >
            <div className="login-enter" style={enterStep(1)}>
              <label className={AUTH_FIELD_LABEL} htmlFor="recovery-email-input">
                Correo electrónico
              </label>
              <div className="group relative">
                <Mail className={AUTH_FIELD_ICON} />
                <input
                  type="email"
                  id="recovery-email-input"
                  autoComplete="email"
                  disabled={isSubmitting}
                  aria-invalid={!!errors.email}
                  {...emailField}
                  onChange={(event) => {
                    void emailField.onChange(event)
                    signalTyping()
                  }}
                  onFocus={() => setEmailFocused(true)}
                  onBlur={(event) => {
                    void emailField.onBlur(event)
                    setEmailFocused(false)
                  }}
                  className={cn(INPUT, AUTH_INPUT)}
                  placeholder="correo@sucursal.com"
                />
              </div>
              {errors.email && <p className={FIELD_ERROR}>{errors.email.message}</p>}
            </div>

            <div className="login-enter" style={enterStep(2)}>
              <button
                type="submit"
                id="recovery-submit"
                disabled={isSubmitting}
                className={AUTH_SUBMIT}
              >
                <SubmitSheen />
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Enviando enlace
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    Enviar enlace de recuperación
                  </>
                )}
              </button>
            </div>
          </form>

          <div className="login-enter" style={enterStep(3)}>
            <Link
              href="/login"
              className="group flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-slate-800"
            >
              <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-x-1" />
              Volver a iniciar sesión
            </Link>
          </div>
        </>
      )}
    </AuthShell>
  )
}
