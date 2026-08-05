'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { FileText, User, type LucideIcon } from 'lucide-react'

export type ProfileTab = 'perfil' | 'documentos'

interface EmployeeProfileTabsProps {
  perfilContent: React.ReactNode
  /** null oculta el tab (rol sin DOCUMENTOS_READ): se renderiza solo el perfil. */
  documentosContent: React.ReactNode | null
}

interface Section {
  id: ProfileTab
  label: string
  icon: LucideIcon
}

const SECTIONS: Section[] = [
  { id: 'perfil', label: 'Perfil', icon: User },
  { id: 'documentos', label: 'Documentos', icon: FileText },
]

/**
 * Resuelve el tab activo desde el query param. Se exporta porque EmployeeDetail
 * también lo necesita: el botón "Editar" y el overlay de cámara solo aplican al
 * tab de perfil, y deben derivar del MISMO criterio que el tablist (la URL es la
 * única fuente de verdad — nada de estado duplicado).
 */
export function resolveProfileTab(tabParam: string | null, hasDocumentos: boolean): ProfileTab {
  return hasDocumentos && tabParam === 'documentos' ? 'documentos' : 'perfil'
}

/** Tabs del detalle de empleado (mismo patrón que EmployeeTabs, con ?tab=). */
export function EmployeeProfileTabs({
  perfilContent,
  documentosContent,
}: EmployeeProfileTabsProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  if (documentosContent === null) {
    return <div className="min-w-0">{perfilContent}</div>
  }

  const activeTab = resolveProfileTab(searchParams.get('tab'), true)

  function setActiveTab(tab: ProfileTab) {
    const params = new URLSearchParams(searchParams.toString())
    if (tab === 'perfil') {
      params.delete('tab')
    } else {
      params.set('tab', tab)
    }
    const query = params.toString()
    router.push(query ? `${pathname}?${query}` : pathname)
  }

  return (
    <div className="min-w-0 space-y-3">
      <div
        role="tablist"
        aria-label="Secciones del empleado"
        className="inline-flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-slate-50/80 p-1"
      >
        {SECTIONS.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id
          return (
            <button
              key={id}
              type="button"
              role="tab"
              id={`employee-profile-tab-${id}`}
              aria-selected={active}
              aria-controls={`employee-profile-tabpanel-${id}`}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-2 ${
                active
                  ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
                  : 'text-slate-500 hover:bg-white/80 hover:text-slate-900'
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full transition ${
                  active ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-500'
                }`}
              >
                <Icon className="h-3 w-3" />
              </span>
              <span>{label}</span>
            </button>
          )
        })}
      </div>

      <div
        role="tabpanel"
        id={`employee-profile-tabpanel-${activeTab}`}
        aria-labelledby={`employee-profile-tab-${activeTab}`}
        className="min-w-0"
      >
        {activeTab === 'perfil' ? perfilContent : documentosContent}
      </div>
    </div>
  )
}
