import { redirectToFirstSetting } from '@/modules/settings/lib/requireSection'

/** /settings/employees no tiene contenido propio: abre su primer ajuste visible. */
export default async function SettingsEmployeesIndexPage() {
  await redirectToFirstSetting('employees')
}
