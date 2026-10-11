import { redirectToFirstSetting } from '@/modules/settings/lib/requireSection'

/** /settings no tiene contenido propio: abre el primer ajuste que el usuario ve. */
export default async function SettingsPage() {
  await redirectToFirstSetting()
}
