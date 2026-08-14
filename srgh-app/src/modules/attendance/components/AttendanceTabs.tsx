'use client'

import { BarChart3, CalendarDays } from 'lucide-react'
import { Tabs, type TabDefinition } from '@/components/ui/Tabs'

type Tab = 'diario' | 'resumen'

interface AttendanceTabsProps {
  diarioContent: React.ReactNode
  resumenContent: React.ReactNode
}

/** Tabs de las sub-vistas del panel de asistencia. */
export function AttendanceTabs({ diarioContent, resumenContent }: AttendanceTabsProps) {
  const tabs: TabDefinition<Tab>[] = [
    { id: 'diario', label: 'Diario', icon: CalendarDays, content: diarioContent },
    { id: 'resumen', label: 'Resumen mensual', icon: BarChart3, content: resumenContent },
  ]

  return <Tabs idPrefix="attendance" ariaLabel="Secciones de asistencia" tabs={tabs} />
}
