import { redirectToFirstSetting } from '@/modules/settings/lib/requireSection'

/** /settings/recruitment no tiene contenido propio: abre su primer ajuste visible. */
export default async function SettingsRecruitmentIndexPage() {
  await redirectToFirstSetting('recruitment')
}
