'use client'

import { useState } from 'react'
import { Clock, Users } from 'lucide-react'

type Tab = 'plantilla' | 'especiales'

interface ScheduleTabsProps {
  plantillaContent: React.ReactNode
  especialesContent: React.ReactNode
}

export function ScheduleTabs({ plantillaContent, especialesContent }: ScheduleTabsProps) {
  const [activeTab, setActiveTab] = useState<Tab>('plantilla')

  return (
    <div className="space-y-6 min-w-0">
      <div className="inline-flex rounded-xl bg-slate-200/60 p-1">
        <button
          onClick={() => setActiveTab('plantilla')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
            activeTab === 'plantilla'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Clock className="h-4 w-4" />
          Plantilla Base Corporativa (General)
        </button>
        <button
          onClick={() => setActiveTab('especiales')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
            activeTab === 'especiales'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Users className="h-4 w-4" />
          Horarios Especiales (Por Colaborador)
        </button>
      </div>

      <div>{activeTab === 'plantilla' ? plantillaContent : especialesContent}</div>
    </div>
  )
}
