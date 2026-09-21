'use client'

import { Briefcase, Clock, Palette } from 'lucide-react'
import { Tabs, type TabDefinition } from '@/components/ui/Tabs'

type Tab = 'apariencia' | 'puestos' | 'tardias'

interface SettingsTabsProps {
  aparienciaContent: React.ReactNode
  puestosContent: React.ReactNode
  tardiasContent: React.ReactNode
}

export function SettingsTabs({
  aparienciaContent,
  puestosContent,
  tardiasContent,
}: SettingsTabsProps) {
  const tabs: TabDefinition<Tab>[] = [
    {
      id: 'apariencia',
      label: 'Apariencia',
      icon: Palette,
      content: aparienciaContent,
    },
    {
      id: 'puestos',
      label: 'Puestos',
      icon: Briefcase,
      content: puestosContent,
    },
    {
      id: 'tardias',
      label: 'Tardías',
      icon: Clock,
      content: tardiasContent,
    },
  ]

  return <Tabs idPrefix="settings" ariaLabel="Secciones de configuración" tabs={tabs} />
}
