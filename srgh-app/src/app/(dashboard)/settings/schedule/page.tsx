import { redirectToFirstSetting } from '@/modules/settings/lib/requireSection'

/** /settings/schedule no tiene contenido propio: abre su primer ajuste visible. */
export default async function SettingsScheduleIndexPage() {
  await redirectToFirstSetting('schedule')
}
