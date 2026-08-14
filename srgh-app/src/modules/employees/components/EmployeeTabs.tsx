'use client'

import { KeyRound, Users } from 'lucide-react'
import { Tabs, type TabDefinition } from '@/components/ui/Tabs'

type Tab = 'empleados' | 'usuarios'

interface EmployeeTabsProps {
  empleadosContent: React.ReactNode
  /** null oculta el tab (rol sin USUARIOS_WRITE): se renderiza solo empleados. */
  usuariosContent: React.ReactNode | null
}

/** Tabs de las sub-áreas del módulo. */
export function EmployeeTabs({ empleadosContent, usuariosContent }: EmployeeTabsProps) {
  const tabs: TabDefinition<Tab>[] = [
    { id: 'empleados', label: 'Empleados', icon: Users, content: empleadosContent },
  ]

  if (usuariosContent !== null) {
    tabs.push({ id: 'usuarios', label: 'Usuarios', icon: KeyRound, content: usuariosContent })
  }

  return <Tabs idPrefix="employee" ariaLabel="Secciones de empleados" tabs={tabs} />
}
