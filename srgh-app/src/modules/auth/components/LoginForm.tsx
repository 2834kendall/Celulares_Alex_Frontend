'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  AlertTriangle,
  ArrowBigUp,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Mail,
} from 'lucide-react'
import { loginSchema, type LoginInput } from '@/modules/auth/types'
import { login } from '@/modules/auth/actions/login'
import { playLoginSuccess } from '@/modules/auth/lib/playLoginSuccess'
import {
  AUTH_FIELD_ICON,
  AUTH_FIELD_LABEL,
  AUTH_INPUT,
  AUTH_SUBMIT,
  AUTH_TITLE,
  AuthShell,
  SubmitSheen,
  enterStep,
} from '@/modules/auth/components/AuthShell'
import { LoginScene, type LoginSceneMood } from '@/modules/auth/components/LoginScene'
import { useTypingSignal } from '@/modules/auth/components/useTypingSignal'
import { cn } from '@/lib/utils/cn'
import { FIELD_ERROR, INPUT } from '@/components/ui/styles'

/* How long the shapes stay upset after a failed attempt before going back to
   reacting to whatever field is focused. */
const ERROR_MOOD_MS = 1600

/* The card flinches when an attempt is rejected: a short, damped shake. */
const REJECT_KEYFRAMES = [
  { transform: 'translateX(0)' },
  { transform: 'translateX(-9px)' },
  { transform: 'translateX(7px)' },
  { transform: 'translateX(-5px)' },
  { transform: 'translateX(3px)' },
  { transform: 'translateX(0)' },
]

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Buenos días'
  if (hour < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

const subscribeToNothing = () => () => {}
const getServerGreeting = () => 'Hola'

export function LoginForm() {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [focusedField, setFocusedField] = useState<'email' | 'password' | null>(null)
  const [errorPulse, setErrorPulse] = useState(false)
  const [typing, signalTyping] = useTypingSignal()
  const [capsLock, setCapsLock] = useState(false)
  const [granted, setGranted] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  /* The hour is the visitor's, not the server's: read on the client only, so
     the server-rendered HTML and the first client render agree. */
  const greeting = useSyncExternalStore(subscribeToNothing, getGreeting, getServerGreeting)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  const emailField = register('email')
  const passwordField = register('password')

  useEffect(() => {
    if (!errorPulse) return

    /* On the card, from here: it is the shell's element, and its entrance is
       a CSS animation that a second one declared in CSS would restart. */
    const card = formRef.current?.closest<HTMLElement>('.login-card')
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (card && typeof card.animate === 'function' && !calm) {
      card.animate(REJECT_KEYFRAMES, { duration: 420, easing: 'cubic-bezier(0.3, 0.6, 0.4, 1)' })
    }

    const timeout = setTimeout(() => setErrorPulse(false), ERROR_MOOD_MS)
    return () => clearTimeout(timeout)
  }, [errorPulse])

  /* The server turned the attempt down: both fields say so for a moment. */
  const rejected = errorPulse && serverError !== null

  /* While the password is hidden they do not look; once it is shown there is
     nothing left to hide, so they lean in to read it. That holds without
     focus too: clicking the toggle takes the focus out of the field. */
  let mood: LoginSceneMood = 'idle'
  if (granted) mood = 'success'
  else if (isSubmitting) mood = 'loading'
  else if (errorPulse) mood = 'error'
  else if (showPassword) mood = 'peeking'
  else if (focusedField === 'password') mood = 'hiding'
  else if (focusedField === 'email') mood = 'watching'

  async function onSubmit(input: LoginInput) {
    setServerError(null)

    try {
      // Server Action: la autenticacion corre en el servidor,
      // el token nunca pasa por el JavaScript del navegador.
      const result = await login(input)

      if (!result.ok) {
        setServerError(result.error)
        setErrorPulse(true)
        return
      }

      /* Rendered NOW, not on the next batch: playLoginSuccess copies the
         screen as it is this instant (cheering shapes, "Acceso concedido"),
         and Next is about to replace it — see that file for why. */
      flushSync(() => setGranted(true))
      playLoginSuccess()

      // Sin router.refresh(): la action escribe las cookies de sesión, y eso
      // ya hace que Next vacíe la caché del router del cliente, así que el
      // replace pide el destino fresco. Sumarle refresh() renderizaba el
      // dashboard dos veces seguidas en cada login.
      router.replace(result.destination)
    } catch {
      setServerError(
        'No se pudo conectar con el servicio de autenticacion. Revise la conexion e intente de nuevo.'
      )
      setErrorPulse(true)
    }
  }

  return (
    <AuthShell scene={<LoginScene mood={mood} typing={typing} />}>
      <div className="login-enter" style={enterStep(0)}>
        <p className="mb-2 inline-flex items-center gap-2 text-xs font-semibold text-brand-700 auth-short:hidden">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-60 motion-reduce:hidden" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-600" />
          </span>
          {greeting}
        </p>
        <h2 className={AUTH_TITLE}>Bienvenido de nuevo</h2>
      </div>

      {serverError && (
        <div
          role="alert"
          className="login-alert flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-800"
        >
          <span className="login-alert-icon flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600">
            <AlertTriangle className="h-3.5 w-3.5" />
          </span>
          <div>{serverError}</div>
        </div>
      )}

      {/* method="post": si el form se envia antes de que React hidrate,
          las credenciales van en el body y nunca en la URL */}
      <form
        ref={formRef}
        onSubmit={handleSubmit(onSubmit, () => setErrorPulse(true))}
        method="post"
        className="space-y-4 auth-wide:space-y-5 auth-short:space-y-3"
        noValidate
      >
        <div className="login-enter" style={enterStep(1)}>
          <label className={AUTH_FIELD_LABEL} htmlFor="email-input">
            Correo Electronico
          </label>
          <div className="group relative">
            <Mail className={AUTH_FIELD_ICON} />
            <input
              type="email"
              id="email-input"
              autoComplete="email"
              disabled={isSubmitting}
              data-rejected={rejected}
              aria-invalid={!!errors.email}
              {...emailField}
              onChange={(event) => {
                void emailField.onChange(event)
                signalTyping()
              }}
              onFocus={() => setFocusedField('email')}
              onBlur={(event) => {
                void emailField.onBlur(event)
                setFocusedField(null)
              }}
              className={cn(INPUT, AUTH_INPUT)}
              placeholder="correo@sucursal.com"
            />
          </div>
          {errors.email && <p className={FIELD_ERROR}>{errors.email.message}</p>}
        </div>

        <div className="login-enter" style={enterStep(2)}>
          <label className={AUTH_FIELD_LABEL} htmlFor="pass-input">
            Contrasena
          </label>
          <div className="group relative">
            <LockKeyhole className={AUTH_FIELD_ICON} />
            <input
              type={showPassword ? 'text' : 'password'}
              id="pass-input"
              autoComplete="current-password"
              disabled={isSubmitting}
              data-rejected={rejected}
              aria-invalid={!!errors.password}
              {...passwordField}
              onChange={(event) => {
                void passwordField.onChange(event)
                signalTyping()
              }}
              onKeyUp={(event) => setCapsLock(event.getModifierState('CapsLock'))}
              onFocus={() => setFocusedField('password')}
              onBlur={(event) => {
                void passwordField.onBlur(event)
                setFocusedField(null)
              }}
              className={cn(INPUT, AUTH_INPUT)}
              placeholder="********"
            />
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              disabled={isSubmitting}
              aria-label={showPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
              className="group/eye absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 transition-colors duration-200 hover:text-brand-600 disabled:cursor-not-allowed"
            >
              <span
                key={String(showPassword)}
                className="login-pop-in flex h-8 w-8 items-center justify-center rounded-lg transition duration-200 group-hover/eye:bg-brand-50 group-active/eye:scale-85"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </span>
            </button>
          </div>
          {errors.password && <p className={FIELD_ERROR}>{errors.password.message}</p>}
          <div className="mt-2 flex items-center justify-between gap-3 auth-short:mt-1.5">
            {capsLock && focusedField === 'password' ? (
              <span className="login-pop-in inline-flex origin-left items-center gap-1 text-xs font-medium text-amber-700">
                <ArrowBigUp className="h-3.5 w-3.5" /> Bloq Mayús activado
              </span>
            ) : (
              <span />
            )}
            <Link
              href="/forgot-password"
              className="auth-link text-xs font-semibold text-brand-700 transition-colors duration-200 hover:text-brand-800"
            >
              ¿Olvidó su contraseña?
            </Link>
          </div>
        </div>

        <div className="login-enter" style={enterStep(3)}>
          <button
            type="submit"
            id="submit-login"
            disabled={isSubmitting}
            className={cn(AUTH_SUBMIT, granted && 'disabled:bg-brand-700')}
          >
            <SubmitSheen />
            {granted ? (
              <span className="login-pop-in inline-flex items-center gap-2">
                <Check className="h-4 w-4" strokeWidth={3} /> Acceso concedido
              </span>
            ) : isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Validando acceso
              </>
            ) : (
              <>
                Iniciar sesion
                <ArrowRight className="auth-submit-arrow h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </form>
    </AuthShell>
  )
}
