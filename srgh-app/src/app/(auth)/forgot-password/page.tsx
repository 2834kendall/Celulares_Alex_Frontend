import { ForgotPasswordForm } from '@/modules/auth/components/ForgotPasswordForm'

/**
 * A diferencia de /login, esta pantalla NO rebota a quien ya tiene sesión:
 * pedir un enlace de recuperación es inofensivo con sesión o sin ella, y
 * quien llegó aquí desde una sesión a medias (JWT vencido en otra pestaña,
 * por ejemplo) igual necesita poder pedirlo.
 */
export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />
}
