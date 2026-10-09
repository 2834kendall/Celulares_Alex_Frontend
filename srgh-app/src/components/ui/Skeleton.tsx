import { cn } from '@/lib/utils/cn'
import { CARD, TABLE_WRAP } from '@/components/ui/styles'

/*
 * Piezas para los `loading.tsx` del dashboard: cada pantalla arma con ellas la
 * silueta de lo que va a cargar (encabezado, pestanas, indicadores, tabla),
 * en vez del spinner unico que habia para toda la app.
 *
 * El brillo que recorre cada bloque es la clase `skeleton` de globals.css,
 * con la misma guarda de movimiento reducido que el resto: sin movimiento,
 * los bloques quedan grises y quietos.
 */

interface SkeletonProps {
  className?: string
  /**
   * Redondeo del bloque. Va aparte de `className` porque `cn()` no resuelve
   * conflictos de Tailwind: un `rounded-full` en className competiria con el
   * redondeo por defecto en vez de reemplazarlo.
   */
  rounded?: string
}

/** Un bloque gris con brillo. Siempre `aria-hidden`: lo anuncia SkeletonRegion. */
export function Skeleton({ className, rounded = 'rounded-md' }: SkeletonProps) {
  return <div aria-hidden="true" className={cn('skeleton bg-slate-200/70', rounded, className)} />
}

interface SkeletonRegionProps {
  /** Lo que lee un lector de pantalla mientras carga. */
  label?: string
  className?: string
  children: React.ReactNode
}

/**
 * Contenedor de la parte que esta cargando: la anuncia una sola vez como
 * "Cargando…" y entra con un pequeno retraso (globals.css), para no
 * parpadear en las navegaciones rapidas.
 */
export function SkeletonRegion({ label = 'Cargando…', className, children }: SkeletonRegionProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      className={cn('skeleton-region min-w-0 space-y-4', className)}
    >
      <span className="sr-only">{label}</span>
      {children}
    </div>
  )
}

/** Silueta de PageHeader, para las pantallas cuyo titulo depende de los datos. */
export function PageHeaderSkeleton({ back = false }: { back?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      {back && <Skeleton className="h-7 w-7 shrink-0" rounded="rounded-full" />}
      <span
        aria-hidden="true"
        className="h-[30px] w-[3px] shrink-0 self-start rounded-full bg-brand-600"
      />
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-3.5 w-72 max-w-full" />
      </div>
    </div>
  )
}

/** Silueta del grupo de pestanas (`Tabs`). */
export function TabsSkeleton({ count }: { count: number }) {
  return (
    <div className="inline-flex gap-1 rounded-xl border border-slate-200 bg-slate-50/80 p-1">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-7 w-28" rounded="rounded-lg" />
      ))}
    </div>
  )
}

/** Silueta de la fila de StatCard de los listados. */
export function StatCardsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="@container">
      <div className="grid grid-cols-1 gap-2.5 @md:grid-cols-3">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className={cn(CARD, 'flex items-center gap-2.5 p-3')}>
            <Skeleton className="h-8 w-8 shrink-0" rounded="rounded-lg" />
            <div className="space-y-1.5">
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="h-4 w-10" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Anchos que varian de fila en fila: una columna de barras identicas se lee
// como un patron, no como texto que esta por llegar.
const CELL_WIDTHS = ['w-24', 'w-16', 'w-20', 'w-28', 'w-14', 'w-24', 'w-12', 'w-20']

interface TableSkeletonProps {
  rows?: number
  columns?: number
  /** Cuantos selects lleva la barra de filtros (ademas del buscador). 0 = sin barra. */
  toolbar?: number
}

/** Silueta de barra de filtros + tabla: la primera columna con avatar y dos lineas. */
export function TableSkeleton({ rows = 8, columns = 5, toolbar = 0 }: TableSkeletonProps) {
  return (
    <div className="space-y-4">
      {toolbar > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 min-w-0 flex-1 basis-56" rounded="rounded-xl" />
          {Array.from({ length: toolbar }, (_, i) => (
            <Skeleton key={i} className="h-9 w-40" rounded="rounded-xl" />
          ))}
        </div>
      )}
      <div className={TABLE_WRAP}>
        <div className="flex items-center gap-6 bg-slate-50 px-3 py-3">
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton key={c} className={cn('h-2.5', c === 0 ? 'w-28 flex-1' : 'w-16')} />
          ))}
        </div>
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="flex items-center gap-6 border-t border-slate-100 px-3 py-3">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Skeleton className="h-8 w-8 shrink-0" rounded="rounded-full" />
              <div className="space-y-1.5">
                <Skeleton
                  className={cn('h-3', CELL_WIDTHS[r % CELL_WIDTHS.length], 'max-w-full')}
                />
                <Skeleton className="h-2.5 w-16" />
              </div>
            </div>
            {Array.from({ length: columns - 1 }, (_, c) => (
              <Skeleton
                key={c}
                className={cn('h-3', CELL_WIDTHS[(r + c + 3) % CELL_WIDTHS.length])}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Silueta generica: encabezado + una tarjeta. Para las subpaginas (fichas,
 * formularios) y como respaldo de todo el dashboard.
 */
export function PageSkeleton({ back = false }: { back?: boolean }) {
  return (
    <SkeletonRegion>
      <PageHeaderSkeleton back={back} />
      <div className={cn(CARD, 'space-y-3 p-5')}>
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-2/3" />
        <div className="grid grid-cols-2 gap-3 pt-3">
          <Skeleton className="h-9" rounded="rounded-xl" />
          <Skeleton className="h-9" rounded="rounded-xl" />
          <Skeleton className="h-9" rounded="rounded-xl" />
          <Skeleton className="h-9" rounded="rounded-xl" />
        </div>
      </div>
    </SkeletonRegion>
  )
}
