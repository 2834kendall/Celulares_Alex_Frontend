import { redirect } from 'next/navigation'

/** Apariencia pasó a ser una pestaña de Empresa; esta ruta sigue por los enlaces viejos. */
export default function SettingsAppearancePage() {
  redirect('/settings/profile?tab=apariencia')
}
