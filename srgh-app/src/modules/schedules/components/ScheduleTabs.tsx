'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Clock, Layers, Users, type LucideIcon } from 'lucide-react'

type Tab = 'plantilla' | 'especiales' | 'jornadas'

interface ScheduleTabsProps {
  plantillaContent: React.ReactNode
  especialesContent: React.ReactNode
  jornadasContent: React.ReactNode
}

interface Section {
  id: Tab
  label: string
  icon: LucideIcon
}

const SECTIONS: Section[] = [
  {
    id: 'plantilla',
    label: 'Horarios especiales',
    icon: Users,
  },
  {
    id: 'especiales',
    label: 'Plantilla base corporativa',
    icon: Clock,
  },
  {
    id: 'jornadas',
    label: 'Tipos de jornada',
    icon: Layers,
  },
]

const VALID_TABS: Tab[] = ['plantilla', 'especiales', 'jornadas']

export function ScheduleTabs({
  plantillaContent,
  especialesContent,
  jornadasContent,
}: ScheduleTabsProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const tabParam = searchParams.get('tab')
  const activeTab: Tab = (VALID_TABS as string[]).includes(tabParam ?? '')
    ? (tabParam as Tab)
    : 'plantilla'

  function setActiveTab(tab: Tab) {
    const params = new URLSearchParams(searchParams.toString())
    if (tab === 'plantilla') {
      params.delete('tab')
    } else {
      params.set('tab', tab)
    }
    const query = params.toString()
    router.push(query ? `${pathname}?${query}` : pathname)
  }

  return (
    <div className="min-w-0 space-y-3">
      <div
        role="tablist"
        aria-label="Secciones de horarios"
        className="inline-flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-slate-50/80 p-1"
      >
        {SECTIONS.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id
          return (
            <button
              key={id}
              type="button"
              role="tab"
              id={`schedule-tab-${id}`}
              aria-selected={active}
              aria-controls={`schedule-tabpanel-${id}`}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-2 ${
                active
                  ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
                  : 'text-slate-500 hover:bg-white/80 hover:text-slate-900'
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full transition ${
                  active ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-500'
                }`}
              >
                <Icon className="h-3 w-3" />
              </span>
              <span>{label}</span>
            </button>
          )
        })}
      </div>

      <div
        role="tabpanel"
        id={`schedule-tabpanel-${activeTab}`}
        aria-labelledby={`schedule-tab-${activeTab}`}
        className="min-w-0"
      >
        {activeTab === 'plantilla'
          ? plantillaContent
          : activeTab === 'especiales'
            ? especialesContent
            : jornadasContent}
      </div>
    </div>
  )
}
