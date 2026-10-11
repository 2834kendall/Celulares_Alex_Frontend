'use client'

import { Briefcase, FileText, User } from 'lucide-react'
import { Tabs, type TabDefinition } from '@/components/ui/Tabs'

export type ProfileTab = 'perfil' | 'contrato' | 'documentos'

interface EmployeeProfileTabsProps {
  perfilContent: React.ReactNode
  /**
   * Siempre visible: es la misma información que antes vivía en el perfil y
   * se ve con el mismo EMPLEADOS_READ, así que no restringe nada.
   */
  contratoContent: React.ReactNode
  /** null oculta el tab (rol sin DOCUMENTOS_READ). */
  documentosContent: React.ReactNode | null
}

/**
 * Resuelve el tab activo desde el query param. Se exporta porque EmployeeDetail
 * también lo necesita: el botón "Editar" y el overlay de cámara solo aplican al
 * tab de perfil, y deben derivar del MISMO criterio que el tablist (la URL es la
 * única fuente de verdad — nada de estado duplicado).
 */
export function resolveProfileTab(tabParam: string | null, hasDocumentos: boolean): ProfileTab {
  if (tabParam === 'contrato') return 'contrato'
  if (hasDocumentos && tabParam === 'documentos') return 'documentos'
  return 'perfil'
}

/** Tabs del detalle de empleado. */
export function EmployeeProfileTabs({
  perfilContent,
  contratoContent,
  documentosContent,
}: EmployeeProfileTabsProps) {
  const tabs: TabDefinition<ProfileTab>[] = [
    { id: 'perfil', label: 'Perfil', icon: User, content: perfilContent },
    { id: 'contrato', label: 'Contrato', icon: Briefcase, content: contratoContent },
  ]

  if (documentosContent !== null) {
    tabs.push({ id: 'documentos', label: 'Documentos', icon: FileText, content: documentosContent })
  }

  return <Tabs idPrefix="employee-profile" ariaLabel="Secciones del empleado" tabs={tabs} />
}
