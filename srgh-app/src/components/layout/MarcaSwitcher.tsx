'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Palette } from 'lucide-react'
import { toast } from 'sonner'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { setMarcaPreview } from '@/modules/settings/actions/setMarcaPreview'
import type { MarcaApariencia } from '@/lib/empresa/get-marca-tema'

interface MarcaSwitcherProps {
  marcas: MarcaApariencia[]
  marcaPreviewId: number | null
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

const SIN_VISTA_PREVIA = '__sin_vista_previa__'
const ETIQUETA = 'Vista previa del tema'

/** Cambia la marca en preview y repinta el shell. `null` sale de la vista previa. */
function useElegirMarca() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function elegir(marcaId: number | null) {
    startTransition(async () => {
      const result = await setMarcaPreview(marcaId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      router.refresh()
    })
  }

  return { pending, elegir }
}

/**
 * Selector de vista previa — SOLO para quien administra la empresa
 * (EMPRESAS_WRITE).
 *
 * Permite a un ADMIN (que no tiene marca propia) ver la app con el tema de
 * una marca navegando la app real. Persiste la eleccion en una cookie
 * server-side (ver marca-preview.ts).
 *
 * Ojo, y esto es lo importante: es pura cosmetica. Cambia el nombre, el logo y
 * los colores que pinta el shell, nunca el alcance de los datos — las policies
 * de RLS siguen leyendo unicamente el JWT real, jamas esta cookie. Por eso la
 * etiqueta dice "tema" y no "marca", y MarcaPreviewBanner lo avisa mientras
 * esta activa: el nombre de la marca arriba se lee como un filtro.
 */
export function MarcaSwitcher({ marcas, marcaPreviewId, variant = 'pill' }: MarcaSwitcherProps) {
  const { pending, elegir } = useElegirMarca()

  if (marcas.length === 0) return null

  const onChange = (value: string) => elegir(value === SIN_VISTA_PREVIA ? null : Number(value))
  const options = [
    { value: SIN_VISTA_PREVIA, label: 'Sin vista previa' },
    ...marcas.map((m) => ({ value: String(m.id), label: m.nombre })),
  ]
  const currentValue = marcaPreviewId ? String(marcaPreviewId) : SIN_VISTA_PREVIA

  if (variant === 'block') {
    return (
      <div className="border-b border-[var(--sidebar-border)] px-4 py-3">
        <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--sidebar-text)]">
          <Palette className="h-3 w-3 shrink-0" aria-hidden="true" />
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
        <Palette className="h-3.5 w-3.5 shrink-0 text-[var(--sidebar-text)]" aria-hidden="true" />
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

/** Mientras hay una vista previa activa: deja claro que los datos no cambiaron. */
export function MarcaPreviewBanner({ marcaNombre }: { marcaNombre: string }) {
  const { pending, elegir } = useElegirMarca()

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-sm text-amber-900"
    >
      <span>
        Estás viendo el tema de <strong className="font-semibold">{marcaNombre}</strong>. Los datos
        siguen siendo de todas las marcas.
      </span>
      <button
        type="button"
        onClick={() => elegir(null)}
        disabled={pending}
        className="font-semibold underline outline-none focus-visible:ring-2 focus-visible:ring-amber-600 disabled:opacity-60 pointer-coarse:min-h-11"
      >
        Salir de la vista previa
      </button>
    </div>
  )
}
