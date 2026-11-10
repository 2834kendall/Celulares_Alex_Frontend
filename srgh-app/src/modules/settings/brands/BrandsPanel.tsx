'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ImageUploadModal } from '@/components/ui/ImageUploadModal'
import { Modal } from '@/components/ui/Modal'
import { useElegirMarca } from '@/components/layout/useElegirMarca'
import { AppearanceForm } from '@/modules/settings/components/AppearanceForm'
import { isNextNavigation } from '@/lib/utils/isNextNavigation'
import { BrandCard } from './BrandCard'
import { BrandForm } from './BrandForm'
import { deleteBrand, removeBrandLogo, saveBrandApariencia, setBrandLogo } from './actions'
import type { Brand, BrandSettings, BrandsEmpresa } from './types'

type Dialogo = { tipo: 'nueva' } | { tipo: 'editar' | 'colores' | 'logo' | 'eliminar'; id: number }

/**
 * Marcas de la empresa como tarjetas. Hay pocas y tienen pocos datos, así que
 * no llevan pantalla propia: cada acción abre su modal.
 */
export function BrandsPanel({
  data,
  empresa,
  marcasElegibles,
}: {
  data: BrandSettings
  empresa: BrandsEmpresa
  /** Ids del selector de la barra: sin selector, o una marca sin tiendas, no se ofrece. */
  marcasElegibles: number[]
}) {
  const router = useRouter()
  const { elegir } = useElegirMarca()
  const [dialogo, setDialogo] = useState<Dialogo | null>(null)
  const cerrar = () => setDialogo(null)

  const brand: Brand | null =
    dialogo && dialogo.tipo !== 'nueva'
      ? (data.brands.find((b) => b.mco_id === dialogo.id) ?? null)
      : null

  async function eliminar(id: number) {
    // Se cierra antes de esperar: un segundo clic no borra dos veces.
    cerrar()
    let result: Awaited<ReturnType<typeof deleteBrand>>
    try {
      result = await deleteBrand(id)
    } catch (error) {
      // Sin este aviso el diálogo ya cerró y la marca sigue ahí, sin ninguna señal.
      if (!isNextNavigation(error)) {
        toast.error(
          'No se pudo confirmar la eliminación. Revisá la conexión y el listado antes de reintentar.'
        )
      }
      return
    }
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success('Marca eliminada.')
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 flex-1 basis-64 text-sm text-slate-600">
          Cada marca agrupa sucursales y puede tener su propio logo y colores. Tocá el logo para
          cambiarlo.
        </p>
        <Button variant="secondary" onClick={() => setDialogo({ tipo: 'nueva' })}>
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Nueva marca
        </Button>
      </div>

      {data.brands.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-6 text-slate-600">
          Todavía no hay marcas. Creá la primera para poder asignarle sus sucursales.
        </p>
      ) : (
        <ul className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(17.5rem,100%),1fr))]">
          {data.brands.map((b) => (
            <BrandCard
              key={b.mco_id}
              brand={b}
              empresa={empresa}
              onLogo={() => setDialogo({ tipo: 'logo', id: b.mco_id })}
              onEdit={() => setDialogo({ tipo: 'editar', id: b.mco_id })}
              onColors={() => setDialogo({ tipo: 'colores', id: b.mco_id })}
              onDelete={() => setDialogo({ tipo: 'eliminar', id: b.mco_id })}
              onViewApp={marcasElegibles.includes(b.mco_id) ? () => elegir(b.mco_id) : undefined}
            />
          ))}
        </ul>
      )}

      {dialogo?.tipo === 'nueva' && (
        <Modal title="Nueva marca" subtitle="Solo hace falta el nombre." onClose={cerrar}>
          <BrandForm onDone={cerrar} onCancel={cerrar} />
        </Modal>
      )}

      {dialogo?.tipo === 'editar' && brand && (
        <Modal title={`Editar ${brand.mco_nombre}`} onClose={cerrar}>
          <BrandForm brand={brand} onDone={cerrar} onCancel={cerrar} />
        </Modal>
      )}

      {dialogo?.tipo === 'colores' && brand && (
        <Modal title={`Colores de ${brand.mco_nombre}`} onClose={cerrar}>
          <AppearanceForm
            descripcion="Se aplican a todas las tiendas de esta marca. Lo que no se personalice sigue los colores de la empresa, también si cambian después."
            unsavedLabel="la apariencia de la marca"
            colorAcentoActual={brand.mco_color_acento}
            colorSidebarActual={brand.mco_color_sidebar}
            heredados={{ acento: empresa.acento, sidebar: empresa.sidebar }}
            heredarLabel="Usar el de la empresa"
            previewNombre={brand.mco_nombre}
            previewLogoUrl={brand.logoUrl ?? empresa.logoUrl}
            onSave={(input) => saveBrandApariencia(brand.mco_id, input)}
            onSaved={cerrar}
            onCancel={cerrar}
            savedAction={
              marcasElegibles.includes(brand.mco_id)
                ? {
                    label: 'Ver solo esta marca',
                    onClick: () => elegir(brand.mco_id),
                  }
                : undefined
            }
          />
        </Modal>
      )}

      {dialogo?.tipo === 'logo' && brand && (
        <ImageUploadModal
          title={`Logo de ${brand.mco_nombre}`}
          currentUrl={brand.logoUrl}
          onClose={cerrar}
          onSave={(formData) => setBrandLogo(brand.mco_id, formData)}
          onRemove={() => removeBrandLogo(brand.mco_id)}
          dropzone={{
            container: 'LOGO_EMPRESA',
            shape: 'square',
            label: 'Subir logo de la marca',
          }}
          copy={{
            saved: 'Logo actualizado.',
            removed: 'Logo eliminado.',
            removeAction: 'Quitar logo',
            removeConfirmTitle: '¿Quitar el logo?',
            removeConfirmMessage: 'El menú volverá a mostrar el logo de la empresa.',
          }}
        />
      )}

      {dialogo?.tipo === 'eliminar' && brand && brand.sucursales.length === 0 && (
        <ConfirmDialog
          title={`¿Eliminar ${brand.mco_nombre}?`}
          message="No tiene sucursales, así que se puede eliminar. Esta acción no se puede deshacer."
          onCancel={cerrar}
          onConfirm={() => void eliminar(brand.mco_id)}
        />
      )}

      {dialogo?.tipo === 'eliminar' && brand && brand.sucursales.length > 0 && (
        <Modal title={`No se puede eliminar ${brand.mco_nombre}`} onClose={cerrar}>
          <p className="text-sm leading-6 text-slate-600">
            Tiene sucursales asignadas. Si ya no se usa, podés desactivarla cuando esas sucursales
            no estén activas.
          </p>
          <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
            <Button variant="secondary" size="md" onClick={cerrar}>
              Cerrar
            </Button>
            <Link
              href={`/settings/branches?marca=${brand.mco_id}`}
              className="rounded-lg bg-brand-action px-4 py-2 text-sm font-bold text-white hover:bg-brand-action-hover"
            >
              Ver sus sucursales
            </Link>
          </div>
        </Modal>
      )}
    </div>
  )
}
