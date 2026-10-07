// TEMPORARY — performance measurement of the dashboard without a session. Reverted right after.
import { NavLinks } from '@/components/layout/NavLinks'
import { PERMISOS } from '@/lib/permissions/catalog'
import { FormatoHoraProvider } from '@/lib/time/FormatoHoraContext'
import { AbsencesWidget } from '@/modules/dashboard/components/AbsencesWidget'
import { AnniversariesWidget } from '@/modules/dashboard/components/AnniversariesWidget'
import { AttendanceWidget } from '@/modules/dashboard/components/AttendanceWidget'
import { BirthdaysPanel } from '@/modules/dashboard/components/BirthdaysPanel'
import { ContractsWidget } from '@/modules/dashboard/components/ContractsWidget'
import { DashboardBoard } from '@/modules/dashboard/components/DashboardBoard'
import { DayScene } from '@/modules/dashboard/components/DayScene'
import { EvaluationsWidget } from '@/modules/dashboard/components/EvaluationsWidget'
import { MonthTardinessWidget } from '@/modules/dashboard/components/MonthTardinessWidget'
import { MyMarksWidget } from '@/modules/dashboard/components/MyMarksWidget'
import { MyWeekWidget } from '@/modules/dashboard/components/MyWeekWidget'
import { NewHiresWidget } from '@/modules/dashboard/components/NewHiresWidget'
import { PayrollWidget } from '@/modules/dashboard/components/PayrollWidget'
import { QuickLinks } from '@/modules/dashboard/components/QuickLinks'
import { RecruitmentWidget } from '@/modules/dashboard/components/RecruitmentWidget'
import { SettlementsWidget } from '@/modules/dashboard/components/SettlementsWidget'
import { TeamWidget } from '@/modules/dashboard/components/TeamWidget'
import {
  DEMO_ABSENCES,
  DEMO_ATTENDANCE,
  DEMO_CONTRACTS,
  DEMO_MONTH,
  DEMO_MY_DAY,
  DEMO_RECRUITMENT,
  DEMO_SETTLEMENTS,
  DEMO_TEAM,
  demoEvaluations,
  demoMyWeek,
  demoPayroll,
  demoPeople,
} from '@/modules/dashboard/lib/demoData'
import { PANEL_IDS, resolvePanels } from '@/modules/dashboard/lib/panels'

const TODAY = '2026-10-07'
const ALL = Object.values(PERMISOS)

/* `?all=1` shows the 14 panels at once (worst case); otherwise the default set. */
export default async function Preview({
  searchParams,
}: {
  searchParams: Promise<{ all?: string }>
}) {
  const { all } = await searchParams
  const people = demoPeople(TODAY)
  const week = demoMyWeek(TODAY)
  const panels = resolvePanels(
    all === '1'
      ? { order: [...PANEL_IDS], hidden: [], sizes: {} }
      : { order: [], hidden: [], sizes: {} },
    ALL
  )
  return (
    <FormatoHoraProvider formato="12h">
      <div className="flex min-h-screen bg-[var(--page-bg)]">
        <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-slate-100 p-3 md:block">
          <div className="sticky top-3">
            <NavLinks permisos={ALL} />
          </div>
        </aside>
        <main id="preview-main" className="min-w-0 flex-1 p-4 md:p-6">
          <div className="@container mx-auto max-w-6xl space-y-4">
            <section className="dash-enter dash-hero relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 @2xl:p-7">
              <h1 className="text-2xl font-black tracking-tight text-slate-900 @2xl:text-3xl">
                Buenas tardes
              </h1>
              <p className="mt-1 mb-16 text-sm text-slate-500">Celulares Alex</p>
              <div className="absolute right-4 bottom-0 hidden h-32 w-64 @3xl:block @5xl:h-40 @5xl:w-80">
                <DayScene period="afternoon" />
              </div>
            </section>
            <DashboardBoard
              panels={panels}
              nodes={{
                attendance: <AttendanceWidget summary={DEMO_ATTENDANCE} />,
                birthdays: (
                  <BirthdaysPanel
                    birthdays={people.birthdays}
                    canSee
                    todayMonth={10}
                    canOpenProfiles={false}
                  />
                ),
                payroll: <PayrollWidget summary={demoPayroll(TODAY)} />,
                recruitment: <RecruitmentWidget summary={DEMO_RECRUITMENT} />,
                anniversaries: <AnniversariesWidget anniversaries={people.anniversaries} />,
                team: <TeamWidget team={DEMO_TEAM} />,
                'my-week': (
                  <MyWeekWidget days={week.days} weeklyTotal={week.weeklyTotal} todayIso={TODAY} />
                ),
                tardiness: <MonthTardinessWidget summary={DEMO_MONTH} monthLabel="octubre" />,
                'new-hires': <NewHiresWidget hires={people.newHires} />,
                settlements: <SettlementsWidget settlements={DEMO_SETTLEMENTS} />,
                'my-marks': <MyMarksWidget summary={DEMO_MY_DAY} />,
                absences: <AbsencesWidget summary={DEMO_ABSENCES} />,
                evaluations: <EvaluationsWidget summary={demoEvaluations(TODAY)} />,
                contracts: <ContractsWidget contracts={DEMO_CONTRACTS} canOpenProfiles={false} />,
              }}
            />
            <QuickLinks permisos={ALL} />
          </div>
        </main>
      </div>
    </FormatoHoraProvider>
  )
}
