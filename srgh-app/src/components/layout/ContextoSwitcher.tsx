'use client'

import { Loader2, Store } from 'lucide-react'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { useElegirMarca } from '@/components/layout/useElegirMarca'
import type { MarcaApariencia } from '@/lib/empresa/get-marca-tema'

interface ContextoSwitcherProps {
  marcas: MarcaApariencia[]
  marcaContextoId: number | null
  /**
   * `pill` es el disparador compacto de la barra superior (solo `sm:` en
   * adelante — en un telefono no hay lugar junto al hamburguesa, el titulo Y
   * el avatar). `block` es la version de ancho completo para el drawer
   * movil, que SI tiene el espacio vertical de sobra. Mismo componente,
   * mismos datos: en telefono se usa uno, en tablet/escritorio el otro —
   * nunca los dos a la vez, para no duplicar el control ni su estado.
   */
  variant?: 'pill' | 'block'
}

const TODAS = '__todas_las_marcas__'
const ETIQUETA = 'Marca'

/**
 * Selector de marca: filtra los listados y pinta el tema de la marca elegida.
 *
 * Solo aparece si las tiendas de la cuenta abarcan dos o más marcas (ver
 * contexto-activo.ts). Elegir una marca solo achica lo que ya se ve: las policies
 * de RLS siguen leyendo únicamente el JWT, jamás esta cookie.
 */
export function ContextoSwitcher({
  marcas,
  marcaContextoId,
  variant = 'pill',
}: ContextoSwitcherProps) {
  const { pending, elegir } = useElegirMarca()

  if (marcas.length === 0) return null

  const onChange = (value: string) => elegir(value === TODAS ? null : Number(value))
  const options = [
    { value: TODAS, label: 'Todas las marcas' },
    ...marcas.map((m) => ({ value: String(m.id), label: m.nombre })),
  ]
  const currentValue = marcaContextoId ? String(marcaContextoId) : TODAS

  if (variant === 'block') {
    return (
      <div className="border-b border-[var(--sidebar-border)] px-4 py-3">
        <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--sidebar-text)]">
          <Store className="h-3 w-3 shrink-0" aria-hidden="true" />
          {ETIQUETA}
        </p>
        <SelectMenu
          ariaLabel={ETIQUETA}
          value={currentValue}
          onChange={onChange}
          disabled={pending}
          className="w-full"
          options={options}
        />
      </div>
    )
  }

  return (
    // Mismo criterio que el correo/rol en UserMenu: se oculta en pantallas
    // angostas para no competir por espacio con el titulo de la pagina — el
    // telefono usa la variante `block` dentro del drawer en su lugar.
    <div className="hidden min-w-0 shrink items-center gap-1.5 sm:flex">
      {pending ? (
        <Loader2
          className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--sidebar-text)]"
          aria-hidden="true"
        />
      ) : (
        <Store className="h-3.5 w-3.5 shrink-0 text-[var(--sidebar-text)]" aria-hidden="true" />
      )}
      <span className="hidden whitespace-nowrap text-xs font-semibold text-[var(--sidebar-text)] lg:inline">
        {ETIQUETA}
      </span>
      <SelectMenu
        ariaLabel={ETIQUETA}
        value={currentValue}
        onChange={onChange}
        disabled={pending}
        className="min-w-0 max-w-[8rem] md:max-w-[12rem]"
        triggerClassName="flex w-full items-center gap-1.5 rounded-full border border-[var(--sidebar-border)] bg-transparent px-3 py-1.5 text-xs font-semibold text-[var(--sidebar-text-strong)] outline-none transition hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-brand-500/60 disabled:cursor-not-allowed disabled:opacity-60"
        options={options}
      />
    </div>
  )
}

/** Mientras hay una marca elegida: los listados y sus totales son solo de ella. */
export function ContextoBanner({ marcaNombre }: { marcaNombre: string }) {
  const { pending, elegir } = useElegirMarca()

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-sm text-amber-900"
    >
      <span>
        Viendo solo <strong className="font-semibold">{marcaNombre}</strong>. Los totales son de
        esta marca.
      </span>
      <button
        type="button"
        onClick={() => elegir(null)}
        disabled={pending}
        className="font-semibold underline outline-none focus-visible:ring-2 focus-visible:ring-amber-600 disabled:opacity-60 pointer-coarse:min-h-11"
      >
        Ver todas
      </button>
    </div>
  )
}
