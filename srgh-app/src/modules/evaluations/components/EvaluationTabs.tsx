'use client'

import { BarChart3, ClipboardList, Star, UserRound } from 'lucide-react'
import { Tabs, type TabDefinition } from '@/components/ui/Tabs'

type Tab = 'metricas' | 'individual' | 'rubros' | 'nueva'

interface EvaluationTabsProps {
  canWrite: boolean
  metricasContent: React.ReactNode
  individualContent: React.ReactNode
  rubrosContent: React.ReactNode
  nuevaContent: React.ReactNode
}

export function EvaluationTabs({
  canWrite,
  metricasContent,
  individualContent,
  rubrosContent,
  nuevaContent,
}: EvaluationTabsProps) {
  const tabs: TabDefinition<Tab>[] = [
    { id: 'metricas', label: 'Métricas sucursal', icon: BarChart3, content: metricasContent },
    { id: 'individual', label: 'Vista individual', icon: UserRound, content: individualContent },
    { id: 'rubros', label: 'Gestionar rubros', icon: ClipboardList, content: rubrosContent },
  ]

  // Sin permiso de escritura el tab no existe; si la URL lo pide igual, Tabs
  // cae al primero por no encontrarlo en la lista.
  if (canWrite) {
    tabs.push({
      id: 'nueva',
      label: 'Nueva evaluación',
      icon: Star,
      content: nuevaContent,
      standalone: true,
    })
  }

  return <Tabs idPrefix="evaluation" ariaLabel="Secciones de evaluaciones" tabs={tabs} />
}
