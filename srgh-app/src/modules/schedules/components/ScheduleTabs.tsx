'use client'

import { CalendarHeart, Clock, Layers, Users } from 'lucide-react'
import { Tabs, type TabDefinition } from '@/components/ui/Tabs'

type Tab = 'plantilla' | 'especiales' | 'jornadas' | 'ausencias'

interface ScheduleTabsProps {
  plantillaContent: React.ReactNode
  especialesContent: React.ReactNode
  jornadasContent: React.ReactNode
  ausenciasContent: React.ReactNode
}

export function ScheduleTabs({
  plantillaContent,
  especialesContent,
  jornadasContent,
  ausenciasContent,
}: ScheduleTabsProps) {
  const tabs: TabDefinition<Tab>[] = [
    {
      id: 'plantilla',
      label: 'Horarios especiales',
      shortLabel: 'Especiales',
      icon: Users,
      content: plantillaContent,
    },
    {
      id: 'especiales',
      label: 'Plantilla base corporativa',
      shortLabel: 'Plantilla',
      icon: Clock,
      content: especialesContent,
    },
    {
      id: 'jornadas',
      label: 'Tipos de jornada',
      shortLabel: 'Jornadas',
      icon: Layers,
      content: jornadasContent,
    },
    {
      id: 'ausencias',
      label: 'Incapacidades y periodos de lactancia',
      shortLabel: 'Incapacidades',
      icon: CalendarHeart,
      content: ausenciasContent,
    },
  ]

  return <Tabs idPrefix="schedule" ariaLabel="Secciones de horarios" tabs={tabs} />
}
