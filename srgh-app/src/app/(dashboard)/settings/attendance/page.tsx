import { redirectToFirstSetting } from '@/modules/settings/lib/requireSection'

/** /settings/attendance no tiene contenido propio: abre su primer ajuste visible. */
export default async function SettingsAttendanceIndexPage() {
  await redirectToFirstSetting('attendance')
}
