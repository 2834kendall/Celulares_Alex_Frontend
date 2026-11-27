import { redirect } from 'next/navigation'
import { getActiveSessionClaims } from '@/lib/auth/session-active'
import { LoginForm } from '@/modules/auth/components/LoginForm'

export default async function LoginPage() {
  const claims = await getActiveSessionClaims()

  if (claims) {
    redirect('/dashboard')
  }

  return <LoginForm />
}
