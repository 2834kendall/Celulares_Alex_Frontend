'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { setSucursalPreview } from '@/modules/settings/actions/setSucursalPreview'
import type { SucursalConApariencia } from '@/lib/empresa/list-sucursales'

interface SucursalSwitcherProps {
  sucursales: SucursalConApariencia[]
  sucursalPreviewId: number | null
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

const MI_VISTA = '__mi_vista__'

/**
 * Selector de sucursal — SOLO para quien administra la empresa
 * (EMPRESAS_WRITE, el mismo permiso que ya rige SucursalAppearancePanel en
 * Configuracion).
 *
 * Resuelve un vacio real: guardar un color en Configuracion lo previsualiza
 * de forma efimera dentro del propio formulario (pintando el shell via DOM
 * directo — ver SucursalAppearanceForm), pero esa previsualizacion se pierde
 * apenas se navega o se refresca la pagina. Un ADMIN sin sucursal fija
 * propia no tenia NINGUNA forma de comprobar el resultado navegando la app
 * real. Este selector persiste la eleccion en una cookie server-side (ver
 * sucursal-preview.ts) para que el tema se mantenga mientras se navega.
 *
 * Ojo, y esto es lo importante: es pura cosmetica. Cambia el nombre y los
 * colores que pinta el shell, nunca el alcance de los datos — las policies
 * de RLS siguen leyendo unicamente el JWT real, jamas esta cookie.
 */
export function SucursalSwitcher({
  sucursales,
  sucursalPreviewId,
  variant = 'pill',
}: SucursalSwitcherProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  if (sucursales.length === 0) return null

  function elegir(value: string) {
    const sucursalId = value === MI_VISTA ? null : Number(value)
    startTransition(async () => {
      const result = await setSucursalPreview(sucursalId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      router.refresh()
    })
  }

  const options = [
    { value: MI_VISTA, label: 'Mi vista' },
    ...sucursales.map((s) => ({ value: String(s.id), label: s.nombre })),
  ]
  const currentValue = sucursalPreviewId ? String(sucursalPreviewId) : MI_VISTA

  if (variant === 'block') {
    return (
      <div className="border-b border-[var(--sidebar-border)] px-4 py-3">
        <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--sidebar-text)]">
          <Building2 className="h-3 w-3 shrink-0" aria-hidden="true" />
          Ver otra sucursal
        </p>
        <SelectMenu
          ariaLabel="Ver otra sucursal"
          value={currentValue}
          onChange={elegir}
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
        <Building2 className="h-3.5 w-3.5 shrink-0 text-[var(--sidebar-text)]" aria-hidden="true" />
      )}
      <SelectMenu
        ariaLabel="Ver otra sucursal"
        value={currentValue}
        onChange={elegir}
        disabled={pending}
        className="min-w-0 max-w-[8rem] md:max-w-[12rem]"
        triggerClassName="flex w-full items-center gap-1.5 rounded-full border border-[var(--sidebar-border)] bg-transparent px-3 py-1.5 text-xs font-semibold text-[var(--sidebar-text-strong)] outline-none transition hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-brand-500/60 disabled:cursor-not-allowed disabled:opacity-60"
        options={options}
      />
    </div>
  )
}
