'use client'

import {
  Briefcase,
  ClipboardList,
  Clock,
  Milestone,
  Palette,
  SlidersHorizontal,
} from 'lucide-react'
import { Tabs, type TabDefinition } from '@/components/ui/Tabs'

type Tab = 'general' | 'apariencia' | 'puestos' | 'tardias' | 'criterios' | 'etapas'

interface SettingsTabsProps {
  /**
   * Preferencias de toda la empresa (formato de hora). null sin
   * EMPRESAS_WRITE: afecta a todas las sucursales, igual que la RLS.
   */
  generalContent: React.ReactNode | null
  aparienciaContent: React.ReactNode
  puestosContent: React.ReactNode
  tardiasContent: React.ReactNode
  /**
   * Criterios de puntaje de reclutamiento (SGRH-61). null cuando el usuario
   * no tiene CATALOGOS_WRITE: la pestaña no se muestra — filtrar la lista es
   * la forma de ocultar una sección por permisos (ver Tabs).
   */
  criteriosContent: React.ReactNode | null
  /** Etapas del embudo de selección (SGRH-61). null sin CATALOGOS_WRITE. */
  etapasContent: React.ReactNode | null
}

export function SettingsTabs({
  generalContent,
  aparienciaContent,
  puestosContent,
  tardiasContent,
  criteriosContent,
  etapasContent,
}: SettingsTabsProps) {
  const tabs: TabDefinition<Tab>[] = [
    ...(generalContent
      ? [
          {
            id: 'general' as const,
            label: 'General',
            icon: SlidersHorizontal,
            content: generalContent,
          },
        ]
      : []),
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
    ...(etapasContent
      ? [
          {
            id: 'etapas' as const,
            label: 'Etapas de selección',
            shortLabel: 'Etapas',
            icon: Milestone,
            content: etapasContent,
          },
        ]
      : []),
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
