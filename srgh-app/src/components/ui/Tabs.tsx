'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

export interface TabDefinition<T extends string> {
  id: T
  label: string
  icon: LucideIcon
  content: React.ReactNode
  /**
   * Saca el boton del grupo de pestanas y lo pinta como accion primaria,
   * manteniendo el cableado ARIA (lo usa "Nueva evaluacion").
   */
  standalone?: boolean
}

interface TabsProps<T extends string> {
  /** Prefijo de los id ARIA: `<idPrefix>-tab-<id>` y `<idPrefix>-tabpanel-<id>`. */
  idPrefix: string
  ariaLabel: string
  /**
   * El primer tab es el que manda: es el activo por defecto y el unico que no
   * escribe `?tab=` en la URL. Filtrar la lista en el llamador es la forma de
   * ocultar una seccion por permisos.
   */
  tabs: TabDefinition<T>[]
}

// Las pestañas tambien responden al toque: sin eso eran el unico control de
// la app que no acusaba recibo, y en tactil —donde no hay hover— el usuario
// se queda sin ninguna señal hasta que la pagina termina de navegar.
const TAB_BUTTON =
  'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition outline-none active:scale-[0.97] motion-reduce:active:scale-100 focus-visible:ring-2 focus-visible:ring-brand-500/60 focus-visible:ring-offset-2'

const STANDALONE_BUTTON =
  'flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-white shadow-sm outline-none transition hover:shadow-md active:scale-[0.98] motion-reduce:active:scale-100 focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2'

/**
 * Pestanas sincronizadas con el query param `?tab=`.
 *
 * Reemplaza a `AttendanceTabs`, `EmployeeTabs`, `EmployeeProfileTabs`,
 * `EvaluationTabs` y `ScheduleTabs`, que eran el mismo componente cinco veces
 * (562 lineas) cambiando solo la lista de secciones y el prefijo de los id.
 *
 * La URL es la unica fuente de verdad del tab activo: no hay estado local que
 * pueda desincronizarse al navegar hacia atras.
 */
export function Tabs<T extends string>({ idPrefix, ariaLabel, tabs }: TabsProps<T>) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const defaultTab = tabs[0]

  // Con una sola seccion visible no hay nada que elegir: se renderiza el panel solo.
  if (tabs.length <= 1) {
    return <div className="min-w-0">{defaultTab ? defaultTab.content : null}</div>
  }

  const tabParam = searchParams.get('tab')
  const activeTab = tabs.find((tab) => tab.id === tabParam) ?? defaultTab

  function setActiveTab(id: T) {
    const params = new URLSearchParams(searchParams.toString())
    if (id === defaultTab.id) {
      params.delete('tab')
    } else {
      params.set('tab', id)
    }
    const query = params.toString()
    router.push(query ? `${pathname}?${query}` : pathname)
  }

  const grouped = tabs.filter((tab) => !tab.standalone)
  const standalone = tabs.filter((tab) => tab.standalone)

  function renderTab(tab: TabDefinition<T>) {
    const { id, label, icon: Icon } = tab
    const active = activeTab.id === id

    return (
      <button
        key={id}
        type="button"
        role="tab"
        id={`${idPrefix}-tab-${id}`}
        aria-selected={active}
        aria-controls={`${idPrefix}-tabpanel-${id}`}
        onClick={() => setActiveTab(id)}
        className={
          tab.standalone
            ? cn(
                STANDALONE_BUTTON,
                active ? 'bg-brand-700 ring-2 ring-brand-700/30' : 'bg-brand-600 hover:bg-brand-700'
              )
            : cn(
                TAB_BUTTON,
                active
                  ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
                  : 'text-slate-500 hover:bg-white/80 hover:text-slate-900'
              )
        }
      >
        {tab.standalone ? (
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <span
            className={cn(
              'flex h-5 w-5 items-center justify-center rounded-full transition',
              active ? 'bg-brand-700 text-white' : 'bg-slate-100 text-slate-500'
            )}
          >
            <Icon className="h-3 w-3" aria-hidden="true" />
          </span>
        )}
        <span>{label}</span>
      </button>
    )
  }

  return (
    // @container: el resto del layout mide el sidebar y su estado, no el
    // viewport (ver DailyAttendanceTable). Aca no hace falta esa precision —
    // el tablist es angosto y cabe en casi cualquier ancho — pero se declara
    // igual para que el punto de corte responda al espacio real disponible,
    // no a si el celular mide 375 o 430px.
    <div className="min-w-0 @container space-y-3">
      {/*
        Centrado en angosto, a la izquierda desde @sm. Un tablist de 2-4
        pildoras pegado al borde izquierdo con medio celular vacio al lado
        se leia como mal alineado, no como una decision de diseño — y con
        cuatro pestañas que envuelven a dos filas (horarios), cada fila
        quedaba con un largo distinto sin ningun eje que las una.
      */}
      <div className="flex flex-col items-center gap-2 @sm:flex-row @sm:flex-wrap @sm:items-center">
        <div
          role="tablist"
          aria-label={ariaLabel}
          className="inline-flex flex-wrap justify-center gap-1 rounded-xl border border-slate-200 bg-slate-50/80 p-1"
        >
          {grouped.map(renderTab)}
        </div>
        {standalone.length > 0 && (
          <div className="flex w-full justify-center gap-2 @sm:w-auto @sm:justify-start">
            {standalone.map(renderTab)}
          </div>
        )}
      </div>

      {/*
        `key` fuerza el remonte al cambiar de pestaña, que es lo que reinicia
        la animacion — sin el, React reusa el nodo y el contenido nuevo
        aparece de golpe. Mismo recurso que usa AppShell para animar cada
        navegacion.
      */}
      <div
        key={activeTab.id}
        role="tabpanel"
        id={`${idPrefix}-tabpanel-${activeTab.id}`}
        aria-labelledby={`${idPrefix}-tab-${activeTab.id}`}
        className="animate-fade-in min-w-0"
      >
        {activeTab.content}
      </div>
    </div>
  )
}
