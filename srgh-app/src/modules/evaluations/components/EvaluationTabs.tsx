'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { BarChart3, ClipboardList, Star, UserRound, type LucideIcon } from 'lucide-react'

type Tab = 'metricas' | 'individual' | 'rubros' | 'nueva'

interface EvaluationTabsProps {
  canWrite: boolean
  metricasContent: React.ReactNode
  individualContent: React.ReactNode
  rubrosContent: React.ReactNode
  nuevaContent: React.ReactNode
}

interface Section {
  id: Tab
  label: string
  icon: LucideIcon
}

const SECTIONS: Section[] = [
  { id: 'metricas', label: 'Métricas sucursal', icon: BarChart3 },
  { id: 'individual', label: 'Vista individual', icon: UserRound },
  { id: 'rubros', label: 'Gestionar rubros', icon: ClipboardList },
]

const VALID_TABS: Tab[] = ['metricas', 'individual', 'rubros', 'nueva']

export function EvaluationTabs({
  canWrite,
  metricasContent,
  individualContent,
  rubrosContent,
  nuevaContent,
}: EvaluationTabsProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const tabParam = searchParams.get('tab')
  let activeTab: Tab = (VALID_TABS as string[]).includes(tabParam ?? '')
    ? (tabParam as Tab)
    : 'metricas'
  if (activeTab === 'nueva' && !canWrite) {
    activeTab = 'metricas'
  }

  function setActiveTab(tab: Tab) {
    const params = new URLSearchParams(searchParams.toString())
    if (tab === 'metricas') {
      params.delete('tab')
    } else {
      params.set('tab', tab)
    }
    const query = params.toString()
    router.push(query ? `${pathname}?${query}` : pathname)
  }

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="tablist"
          aria-label="Secciones de evaluaciones"
          className="inline-flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-slate-50/80 p-1"
        >
          {SECTIONS.map(({ id, label, icon: Icon }) => {
            const active = activeTab === id
            return (
              <button
                key={id}
                type="button"
                role="tab"
                id={`evaluation-tab-${id}`}
                aria-selected={active}
                aria-controls={`evaluation-tabpanel-${id}`}
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

        {canWrite && (
          <button
            type="button"
            role="tab"
            id="evaluation-tab-nueva"
            aria-selected={activeTab === 'nueva'}
            aria-controls="evaluation-tabpanel-nueva"
            onClick={() => setActiveTab('nueva')}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 active:scale-[0.98] ${
              activeTab === 'nueva'
                ? 'bg-blue-700 text-white ring-2 ring-blue-700/30'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            <Star className="h-3.5 w-3.5" />
            <span>Nueva evaluación</span>
          </button>
        )}
      </div>

      <div
        role="tabpanel"
        id={`evaluation-tabpanel-${activeTab}`}
        aria-labelledby={`evaluation-tab-${activeTab}`}
        className="min-w-0"
      >
        {activeTab === 'metricas'
          ? metricasContent
          : activeTab === 'individual'
            ? individualContent
            : activeTab === 'rubros'
              ? rubrosContent
              : nuevaContent}
      </div>
    </div>
  )
}
