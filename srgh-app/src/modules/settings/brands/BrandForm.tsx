'use client'

import { useForm } from '@/hooks/useProtectedForm'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import {
  INPUT_CLASSES,
  Labeled,
  getFieldError,
} from '@/modules/employees/components/EmployeeFields'
import { isNextNavigation } from '@/lib/utils/isNextNavigation'
import { brandSchema, type Brand, type BrandInput } from './types'
import { saveBrand } from './actions'

/**
 * Nombre y estado de una marca, dentro de un modal. Crear una marca es solo
 * ponerle nombre: el logo y los colores se editan después desde su tarjeta.
 */
export function BrandForm({
  brand,
  onDone,
  onCancel,
}: {
  brand?: Brand
  onDone: () => void
  onCancel: () => void
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    guard,
    formState: { errors, isSubmitting },
  } = useForm<BrandInput>({
    unsavedLabel: 'la marca',
    resolver: zodResolver(brandSchema),
    defaultValues: {
      mco_nombre: brand?.mco_nombre ?? '',
      mco_activa: brand?.mco_activa ?? true,
    },
  })
  const err = (name: string) => getFieldError(errors, name)

  // Se sabe de antemano que la RPC lo rechazaría: mejor decirlo antes de intentar.
  const activaBloqueada = Boolean(brand?.mco_activa && brand.sucursales.some((s) => s.suc_activa))

  async function submit(data: BrandInput) {
    setError(null)
    try {
      const r = await saveBrand(brand?.mco_id ?? null, data)
      if (!r.ok) {
        setError(r.error)
        return
      }
      guard.acceptChanges()
      toast.success(
        brand ? 'Marca actualizada.' : 'Marca creada. Agregale logo y colores desde su tarjeta.'
      )
      router.refresh()
      onDone()
    } catch (e) {
      if (isNextNavigation(e)) return
      setError(
        'No se pudo confirmar el guardado. Revisá la conexión y el listado antes de reintentar; tus datos siguen en el formulario.'
      )
    }
  }

  return (
    <form
      ref={(element) => guard.bindRoot(element)}
      onSubmit={handleSubmit(submit)}
      className="space-y-4"
      noValidate
    >
      {error && <Alert>{error}</Alert>}
      <fieldset disabled={isSubmitting} className="space-y-4">
        <legend className="sr-only">Datos de la marca</legend>
        <Labeled label="Nombre *" error={err('mco_nombre')}>
          <input
            {...register('mco_nombre')}
            autoFocus
            className={INPUT_CLASSES}
            aria-invalid={!!err('mco_nombre')}
          />
        </Labeled>
        {brand && (
          <div>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input {...register('mco_activa')} type="checkbox" disabled={activaBloqueada} />
              Marca activa
            </label>
            {activaBloqueada && (
              <p className="mt-1 text-xs text-slate-600">
                Para desactivarla, primero desactivá o mové{' '}
                <Link
                  href={`/settings/branches?marca=${brand.mco_id}`}
                  className="font-semibold underline"
                >
                  sus sucursales activas
                </Link>
                .
              </p>
            )}
          </div>
        )}
      </fieldset>
      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
        <Button
          type="button"
          variant="secondary"
          size="md"
          disabled={isSubmitting}
          onClick={() => guard.confirmLeave(onCancel)}
        >
          Cancelar
        </Button>
        <Button type="submit" size="md" disabled={isSubmitting}>
          {isSubmitting ? 'Guardando…' : brand ? 'Guardar cambios' : 'Crear marca'}
        </Button>
      </div>
    </form>
  )
}
