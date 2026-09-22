'use client'

import { Briefcase, ClipboardList, Clock, Palette } from 'lucide-react'
import { Tabs, type TabDefinition } from '@/components/ui/Tabs'

type Tab = 'apariencia' | 'puestos' | 'tardias' | 'criterios'

interface SettingsTabsProps {
  aparienciaContent: React.ReactNode
  puestosContent: React.ReactNode
  tardiasContent: React.ReactNode
  /**
   * Criterios de puntaje de reclutamiento (SGRH-61). null cuando el usuario
   * no tiene CATALOGOS_WRITE: la pestaña no se muestra — filtrar la lista es
   * la forma de ocultar una sección por permisos (ver Tabs).
   */
  criteriosContent: React.ReactNode | null
}

export function SettingsTabs({
  aparienciaContent,
  puestosContent,
  tardiasContent,
  criteriosContent,
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
    ...(criteriosContent
      ? [
          {
            id: 'criterios' as const,
            label: 'Criterios de selección',
            shortLabel: 'Criterios',
            icon: ClipboardList,
            content: criteriosContent,
          },
        ]
      : []),
  ]

  return <Tabs idPrefix="settings" ariaLabel="Secciones de configuración" tabs={tabs} />
}
