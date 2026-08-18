'use client'

import { Briefcase, Palette } from 'lucide-react'
import { Tabs, type TabDefinition } from '@/components/ui/Tabs'

type Tab = 'apariencia' | 'puestos'

interface SettingsTabsProps {
  aparienciaContent: React.ReactNode
  puestosContent: React.ReactNode
}

export function SettingsTabs({ aparienciaContent, puestosContent }: SettingsTabsProps) {
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
  ]

  return <Tabs idPrefix="settings" ariaLabel="Secciones de configuración" tabs={tabs} />
}
