import { requireKioskAccess } from '@/modules/attendance/lib/kioskAccess'
import { getScheduledEmployees } from '@/modules/attendance/actions/getScheduledEmployees'
import { KioskScreen } from '@/modules/attendance/components/kiosk/KioskScreen'

export default async function KioscoPage() {
  await requireKioskAccess()

  const result = await getScheduledEmployees()

  if (!result.ok) {
    return (
      <div className="my-auto max-w-md rounded-3xl bg-white p-6 text-center text-base text-slate-700 shadow-xl shadow-blue-900/5 ring-1 ring-blue-100">
        <p>{result.error}</p>
      </div>
    )
  }

  return <KioskScreen employees={result.data} />
}
