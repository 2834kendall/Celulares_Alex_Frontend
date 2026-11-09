'use client'

import { Building2, Palette, Tag } from 'lucide-react'
import { Tabs, type TabDefinition } from '@/components/ui/Tabs'

type CompanyTab = 'informacion' | 'apariencia' | 'marcas'

/**
 * Pestañas de Configuración → Empresa. El contenido llega ya resuelto desde el
 * servidor: la página carga solo los datos de la pestaña activa.
 */
export function CompanyTabs({
  informacion,
  apariencia,
  marcas,
}: {
  informacion: React.ReactNode
  apariencia: React.ReactNode
  marcas: React.ReactNode
}) {
  const tabs: TabDefinition<CompanyTab>[] = [
    { id: 'informacion', label: 'Información', icon: Building2, content: informacion },
    { id: 'apariencia', label: 'Apariencia', icon: Palette, content: apariencia },
    { id: 'marcas', label: 'Marcas', icon: Tag, content: marcas },
  ]
  return <Tabs idPrefix="company" ariaLabel="Apartados de la empresa" tabs={tabs} />
}
