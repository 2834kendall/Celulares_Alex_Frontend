import { CalendarClock, Inbox } from 'lucide-react'
import type { MyAttendanceDay } from '@/modules/attendance/actions/getMyMarks'
import { EmptyState } from '@/components/ui/EmptyState'

interface MyAttendanceHistoryProps {
  data: MyAttendanceDay[]
}

function formatDay(dateISO: string) {
  return new Intl.DateTimeFormat('es-CR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(new Date(`${dateISO}T00:00:00`))
}

function MarkTime({ time }: { time: string | undefined }) {
  return (
    <span className={time ? 'tabular-nums text-slate-700' : 'text-slate-300'}>{time ?? '—'}</span>
  )
}

/**
 * Autoservicio: el propio empleado consultando sus marcas de la ultima
 * quincena. Solo lectura, sin botones de correccion — eso es exclusivo del
 * panel del gerente (DailyAttendanceTable).
 */
export function MyAttendanceHistory({ data }: MyAttendanceHistoryProps) {
  return (
    <section className="mx-auto max-w-2xl">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <CalendarClock className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-bold text-slate-900">Mi historial de asistencia</h2>
            <p className="text-xs text-slate-500">Marcas de los ultimos 15 dias.</p>
          </div>
        </div>

        {data.length === 0 ? (
          <EmptyState icon={Inbox} title="Todavia no tienes marcas registradas." className="mt-6" />
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="py-1.5 text-left font-semibold">Dia</th>
                  <th className="py-1.5 text-left font-semibold">Entrada</th>
                  <th className="py-1.5 text-left font-semibold">Almuerzo</th>
                  <th className="py-1.5 text-left font-semibold">Salida</th>
                </tr>
              </thead>
              <tbody>
                {data.map((day) => (
                  <tr key={day.date} className="border-t border-slate-100">
                    <td className="py-2 font-medium capitalize text-slate-700">
                      {formatDay(day.date)}
                    </td>
                    <td className="py-2">
                      <MarkTime time={day.entrada?.time} />
                    </td>
                    <td className="py-2">
                      <MarkTime time={day.inicioAlmuerzo?.time} />
                      {day.finAlmuerzo && (
                        <>
                          {' '}
                          – <MarkTime time={day.finAlmuerzo.time} />
                        </>
                      )}
                    </td>
                    <td className="py-2">
                      <MarkTime time={day.salida?.time} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
