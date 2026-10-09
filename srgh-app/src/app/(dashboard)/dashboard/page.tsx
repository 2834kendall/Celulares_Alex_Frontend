import type { ReactNode } from 'react'
import { CalendarClock, PartyPopper, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getEmpresaNombre } from '@/lib/empresa/get-empresa-nombre'
import { PERMISOS } from '@/lib/permissions/catalog'
import { StatCard } from '@/components/ui/StatCard'
import { CARD } from '@/components/ui/styles'
import { getDailyAttendance } from '@/modules/attendance/actions/getDailyAttendance'
import { getMonthlyAttendanceSummary } from '@/modules/attendance/actions/getMonthlyAttendanceSummary'
import { getMyMarks } from '@/modules/attendance/actions/getMyMarks'
import { loadTardinessTypes } from '@/modules/attendance/lib/tardinessTypes'
import { nowInCostaRica, timeOfDay, todayInCostaRica } from '@/modules/attendance/lib/time'
import {
  getDashboardAbsences,
  getDashboardEvaluations,
  getExpiringContracts,
  getMyAbsences,
  getMyEvaluations,
  getWeekSchedule,
} from '@/modules/dashboard/actions/getDashboardExtras'
import { getDashboardPeople } from '@/modules/dashboard/actions/getDashboardPeople'
import { AbsencesWidget } from '@/modules/dashboard/components/AbsencesWidget'
import { AnniversariesWidget } from '@/modules/dashboard/components/AnniversariesWidget'
import { AttendanceWidget } from '@/modules/dashboard/components/AttendanceWidget'
import { BirthdaysPanel } from '@/modules/dashboard/components/BirthdaysPanel'
import { ContractsWidget } from '@/modules/dashboard/components/ContractsWidget'
import { CountUp } from '@/modules/dashboard/components/CountUp'
import { DashboardBoard } from '@/modules/dashboard/components/DashboardBoard'
import { DayScene, type DayPeriod } from '@/modules/dashboard/components/DayScene'
import { EvaluationsWidget } from '@/modules/dashboard/components/EvaluationsWidget'
import { MonthTardinessWidget } from '@/modules/dashboard/components/MonthTardinessWidget'
import { MyAbsencesWidget } from '@/modules/dashboard/components/MyAbsencesWidget'
import { MyEvaluationsWidget } from '@/modules/dashboard/components/MyEvaluationsWidget'
import { MyMarksWidget } from '@/modules/dashboard/components/MyMarksWidget'
import { MyWeekWidget } from '@/modules/dashboard/components/MyWeekWidget'
import { NewHiresWidget } from '@/modules/dashboard/components/NewHiresWidget'
import { PayrollWidget } from '@/modules/dashboard/components/PayrollWidget'
import { RecruitmentWidget } from '@/modules/dashboard/components/RecruitmentWidget'
import { SettlementsWidget } from '@/modules/dashboard/components/SettlementsWidget'
import { TeamScheduleWidget } from '@/modules/dashboard/components/TeamScheduleWidget'
import { TeamWidget } from '@/modules/dashboard/components/TeamWidget'
import { MONTHS_LONG, countdownLabel } from '@/modules/dashboard/lib/birthdays'
import {
  DEMO_ABSENCES,
  DEMO_ATTENDANCE,
  DEMO_CONTRACTS,
  DEMO_MONTH,
  DEMO_MY_DAY,
  DEMO_MY_EVALUATIONS,
  DEMO_RECRUITMENT,
  DEMO_SETTLEMENTS,
  DEMO_TEAM,
  demoEvaluations,
  demoMyAbsences,
  demoMyWeek,
  demoPayroll,
  demoPeople,
  demoWeekSchedule,
} from '@/modules/dashboard/lib/demoData'
import { describeMyDay } from '@/modules/dashboard/lib/extras'
import { PANELS, resolvePanels, type PanelId } from '@/modules/dashboard/lib/panels'
import { readDashboardPrefs } from '@/modules/dashboard/lib/prefsCookie'
import {
  summarizeAttendance,
  summarizeMonth,
  summarizePayroll,
  summarizeRecruitment,
} from '@/modules/dashboard/lib/summaries'
import { getContratosPorLiquidar } from '@/modules/payroll/actions/getContratosPorLiquidar'
import { getPeriodos } from '@/modules/payroll/actions/getPeriodos'
import { getPostulacionesBoard } from '@/modules/recruitment/actions/getPostulacionesBoard'
import { getMySchedule } from '@/modules/schedules/actions/getMySchedule'
import type { SgrhJwtClaims } from '@/types/auth'

const COSTA_RICA_TIME_ZONE = 'America/Costa_Rica'

const GREETINGS: Record<DayPeriod, string> = {
  morning: 'Buenos días',
  afternoon: 'Buenas tardes',
  night: 'Buenas noches',
}

/* The sample view shows every panel, whatever the role. */
const DEMO_PERMISOS = [
  PERMISOS.ASISTENCIA_READ,
  PERMISOS.EMPLEADOS_READ,
  PERMISOS.NOMINA_READ,
  PERMISOS.RECLUTAMIENTO_READ,
  PERMISOS.MI_HORARIO_READ,
  PERMISOS.NOMINA_WRITE,
  PERMISOS.AUSENCIAS_READ,
  PERMISOS.EVALUACIONES_READ,
  PERMISOS.HORARIOS_READ,
]

/* Greeting and date are resolved on the server, in the company's time zone:
   the HTML that arrives is already right, with nothing to fix on hydration. */
function costaRicaNow() {
  const now = new Date()
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: COSTA_RICA_TIME_ZONE,
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(now)
  )
  const dateLabel = new Intl.DateTimeFormat('es-CR', {
    timeZone: COSTA_RICA_TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(now)
  const period: DayPeriod = hour < 12 ? 'morning' : hour < 19 ? 'afternoon' : 'night'

  return { period, dateLabel }
}

/** A panel whose data could not be loaded: it says so, in its own place. */
function PanelUnavailable({ label }: { label: string }) {
  return (
    <section className={`${CARD} flex min-h-32 items-center justify-center p-5`}>
      <p className="text-center text-sm text-slate-500">
        No se pudo cargar «{label}». Recargue la página para intentarlo de nuevo.
      </p>
    </section>
  )
}

/*
 * Everything on this page breaks on the width of the DASHBOARD (container
 * queries, the `@…:` variants), not of the window: the sidebar takes a
 * variable share of the screen, so at a 1024px window the content is 768px
 * wide — a window breakpoint would lay it out for space it does not have.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string }>
}) {
  const supabase = await createClient()
  const [{ demo }, { data: session }] = await Promise.all([searchParams, supabase.auth.getClaims()])

  const meta = (session?.claims.app_metadata ?? {}) as Partial<SgrhJwtClaims>
  const permisos = Array.isArray(meta.permisos) ? meta.permisos : []

  /* `?demo=1` swaps in made-up figures to preview every panel full. Never in
     production: there the parameter is ignored. */
  const isDemo = demo === '1' && process.env.NODE_ENV !== 'production'
  const todayIso = todayInCostaRica()

  /* What this person chose to see, in their order and sizes (a cookie: see
     prefsCookie). Read BEFORE loading anything, so a hidden panel costs no
     query at all. */
  const prefs = await readDashboardPrefs(meta.usr_id)
  const panels = resolvePanels(prefs, isDemo ? DEMO_PERMISOS : permisos)
  const shown = new Set(panels.filter((panel) => !panel.hidden).map((panel) => panel.id))
  const loads = (id: PanelId) => !isDemo && shown.has(id)

  /*
   * Each panel reuses the loader of the module it summarizes. Those loaders
   * redirect to /unauthorized when the permission is missing, and the
   * dashboard is the landing page of EVERY role — resolvePanels already left
   * out the panels this role cannot open, so a loader only runs for whoever
   * can open that module.
   */
  const loadsAttendance = loads('attendance') && meta.empresa_id
  const [
    empresaNombre,
    realPeople,
    attendanceResult,
    tiposResult,
    periodosResult,
    boardResult,
    myWeekResult,
    monthResult,
    settlementsResult,
    myMarksResult,
    realAbsences,
    realEvaluations,
    realContracts,
    realMyAbsences,
    realMyEvaluations,
    realWeekSchedule,
  ] = await Promise.all([
    getEmpresaNombre(),
    /* Birthdays, anniversaries and headcount come from one pair of queries,
         and the greeting uses them too: always loaded (it degrades by itself
         when the role cannot read employees). */
    getDashboardPeople(),
    loadsAttendance ? getDailyAttendance(todayIso) : null,
    /* The company's own tardiness catalog (Settings): the same one the
         attendance report classifies with. It is cached per request, so this
         is the read getDailyAttendance already does, not a second one. */
    loadsAttendance ? loadTardinessTypes(supabase, meta.empresa_id as number) : null,
    loads('payroll') ? getPeriodos() : null,
    loads('recruitment') ? getPostulacionesBoard() : null,
    /* Any day of the week works: the loader finds its Monday. */
    loads('my-week') ? getMySchedule(todayIso) : null,
    loads('tardiness') ? getMonthlyAttendanceSummary({ fecha: todayIso }) : null,
    loads('settlements') ? getContratosPorLiquidar() : null,
    loads('my-marks') ? getMyMarks() : null,
    loads('absences') ? getDashboardAbsences(todayIso) : null,
    loads('evaluations') ? getDashboardEvaluations(todayIso) : null,
    loads('contracts') ? getExpiringContracts(todayIso) : null,
    loads('my-absences') ? getMyAbsences(todayIso) : null,
    loads('my-evaluations') ? getMyEvaluations() : null,
    loads('team-schedule') ? getWeekSchedule(todayIso) : null,
  ])

  const people = isDemo ? { ...demoPeople(todayIso), team: DEMO_TEAM, canSee: true } : realPeople
  const attendance = isDemo
    ? DEMO_ATTENDANCE
    : /* Without the catalog there is no summary: classifying with rules that
         are not the company's, and not saying so, is worse than not showing. */
      attendanceResult?.ok && tiposResult?.ok
      ? summarizeAttendance(attendanceResult.data, timeOfDay(nowInCostaRica()), tiposResult.data)
      : null
  const payroll = isDemo
    ? demoPayroll(todayIso)
    : periodosResult?.ok
      ? summarizePayroll(periodosResult.data, todayIso)
      : null
  const recruitment = isDemo
    ? DEMO_RECRUITMENT
    : boardResult?.ok
      ? summarizeRecruitment(boardResult.data)
      : null

  const myWeek = isDemo ? demoMyWeek(todayIso) : myWeekResult?.ok ? myWeekResult : null
  const month = isDemo ? DEMO_MONTH : monthResult?.ok ? summarizeMonth(monthResult.data) : null
  const settlements = isDemo
    ? DEMO_SETTLEMENTS
    : settlementsResult?.ok
      ? settlementsResult.data
          .map((contrato) => ({
            id: contrato.historialLaboralId,
            nombre: contrato.nombre,
            fechaSalida: contrato.fechaSalida,
            motivo: contrato.motivo?.nombre ?? null,
          }))
          /* Oldest exit first: the one that has waited the longest. */
          .sort((a, b) => a.fechaSalida.localeCompare(b.fechaSalida))
      : null

  /* The loader brings a fortnight of the reader's marks; the panel is about
     today, and no row for today means no marks yet — not a failure. */
  const myDay = isDemo
    ? DEMO_MY_DAY
    : myMarksResult?.ok
      ? describeMyDay(myMarksResult.data.find((day) => day.date === todayIso) ?? null)
      : null
  const absences = isDemo ? DEMO_ABSENCES : realAbsences
  const evaluations = isDemo ? demoEvaluations(todayIso) : realEvaluations
  const contracts = isDemo ? DEMO_CONTRACTS : realContracts
  const myAbsences = isDemo ? demoMyAbsences(todayIso) : realMyAbsences
  const myEvaluations = isDemo ? DEMO_MY_EVALUATIONS : realMyEvaluations
  const weekSchedule = isDemo ? demoWeekSchedule(todayIso) : realWeekSchedule

  const todayMonth = Number(todayIso.split('-')[1])
  const nextBirthday = people.birthdays[0]
  const { period, dateLabel } = costaRicaNow()

  /* One entry per panel of the registry: adding a panel there fails to
     compile here until it has its node. Only the shown ones are rendered. */
  const render: Record<PanelId, () => ReactNode> = {
    attendance: () => attendance && <AttendanceWidget summary={attendance} step={1} />,
    birthdays: () => (
      <BirthdaysPanel
        birthdays={people.birthdays}
        canSee={people.canSee}
        todayMonth={todayMonth}
        canOpenProfiles={!isDemo}
        step={2}
      />
    ),
    payroll: () => payroll && <PayrollWidget summary={payroll} step={3} />,
    recruitment: () => recruitment && <RecruitmentWidget summary={recruitment} step={4} />,
    anniversaries: () =>
      people.canSee && <AnniversariesWidget anniversaries={people.anniversaries} step={5} />,
    team: () => people.canSee && <TeamWidget team={people.team} step={6} />,
    'my-week': () =>
      myWeek && (
        <MyWeekWidget
          days={myWeek.days}
          weeklyTotal={myWeek.weeklyTotal}
          todayIso={todayIso}
          step={7}
        />
      ),
    tardiness: () =>
      month && (
        <MonthTardinessWidget summary={month} monthLabel={MONTHS_LONG[todayMonth - 1]} step={8} />
      ),
    'new-hires': () => people.canSee && <NewHiresWidget hires={people.newHires} step={9} />,
    settlements: () => settlements && <SettlementsWidget settlements={settlements} step={10} />,
    'my-marks': () => myDay && <MyMarksWidget summary={myDay} step={11} />,
    'my-absences': () => myAbsences && <MyAbsencesWidget summary={myAbsences} step={15} />,
    'my-evaluations': () =>
      myEvaluations && <MyEvaluationsWidget summary={myEvaluations} step={16} />,
    'team-schedule': () => weekSchedule && <TeamScheduleWidget summary={weekSchedule} step={17} />,
    absences: () => absences && <AbsencesWidget summary={absences} step={12} />,
    evaluations: () => evaluations && <EvaluationsWidget summary={evaluations} step={13} />,
    contracts: () =>
      contracts && <ContractsWidget contracts={contracts} canOpenProfiles={!isDemo} step={14} />,
  }

  const nodes: Partial<Record<PanelId, ReactNode>> = {}
  for (const panel of PANELS) {
    if (!shown.has(panel.id)) continue
    nodes[panel.id] = render[panel.id]() || <PanelUnavailable label={panel.label} />
  }

  return (
    <div className="@container mx-auto max-w-6xl space-y-4">
      <section className="dash-enter dash-hero relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 @2xl:p-7">
        <div className="relative max-w-xl">
          <p className="text-xs font-semibold tracking-wide text-brand-700 first-letter:uppercase">
            {dateLabel}
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900 @2xl:text-3xl">
            {GREETINGS[period]}
          </h1>
          <p className="mt-1 text-sm text-slate-500">{empresaNombre}</p>
          {isDemo && (
            <p className="mt-3 inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
              Datos de ejemplo
            </p>
          )}
        </div>

        <div className="absolute right-4 bottom-0 hidden h-32 w-64 @3xl:block @5xl:h-40 @5xl:w-80">
          <DayScene period={period} />
        </div>

        {(people.canSee || attendance) && (
          <div className="relative mt-5 grid grid-cols-1 gap-2.5 @lg:grid-cols-3 @3xl:max-w-md @5xl:max-w-xl">
            {people.canSee && (
              <StatCard
                icon={Users}
                label="Colaboradores activos"
                value={<CountUp value={people.activeCount} />}
                hoverable
                className="dash-enter dash-stat"
              />
            )}
            {attendance && (
              <StatCard
                icon={CalendarClock}
                tone="emerald"
                label="Presentes hoy"
                value={
                  <>
                    <CountUp value={attendance.onTime + attendance.late} />
                    <span className="text-sm font-semibold text-slate-400">
                      {' '}
                      / {attendance.expected}
                    </span>
                  </>
                }
                hoverable
                className="dash-enter dash-stat"
              />
            )}
            {people.canSee && (
              <StatCard
                icon={PartyPopper}
                tone="amber"
                label="Próximo cumpleaños"
                value={nextBirthday ? countdownLabel(nextBirthday.daysUntil) : '—'}
                hoverable
                className="dash-enter dash-stat"
              />
            )}
          </div>
        )}
      </section>

      <DashboardBoard panels={panels} nodes={nodes} />
    </div>
  )
}
