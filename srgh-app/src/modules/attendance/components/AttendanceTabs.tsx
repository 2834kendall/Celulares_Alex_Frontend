'use client'

import { BarChart3, CalendarDays, ClipboardCheck } from 'lucide-react'
import { Tabs, type TabDefinition } from '@/components/ui/Tabs'

type Tab = 'diario' | 'resumen' | 'justificar'

interface AttendanceTabsProps {
  diarioContent: React.ReactNode
  resumenContent: React.ReactNode
  /**
   * Bandeja "Por justificar". Se omite para quien no puede justificar nada:
   * una pestaña de tareas que no puede resolver solo seria ruido.
   */
  justificarContent?: React.ReactNode
  /** Cuantas tardias/ausencias quedan pendientes: se muestra en la pestaña. */
  pendingCount?: number
}

/** Tabs de las sub-vistas del panel de asistencia. */
export function AttendanceTabs({
  diarioContent,
  resumenContent,
  justificarContent,
  pendingCount = 0,
}: AttendanceTabsProps) {
  const tabs: TabDefinition<Tab>[] = [
    { id: 'diario', label: 'Diario', icon: CalendarDays, content: diarioContent },
    {
      id: 'resumen',
      label: 'Resumen mensual',
      shortLabel: 'Mensual',
      icon: BarChart3,
      content: resumenContent,
    },
  ]

  if (justificarContent !== undefined) {
    tabs.push({
      id: 'justificar',
      label: pendingCount > 0 ? `Por justificar (${pendingCount})` : 'Por justificar',
      shortLabel: pendingCount > 0 ? `Justificar (${pendingCount})` : 'Justificar',
      icon: ClipboardCheck,
      content: justificarContent,
    })
  }

  return <Tabs idPrefix="attendance" ariaLabel="Secciones de asistencia" tabs={tabs} />
}
