'use client'

import { useForm } from '@/hooks/useProtectedForm'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FormProvider } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import {
  AddressFields,
  CatalogSelect,
  INPUT_CLASSES,
  Labeled,
  getFieldError,
} from '@/modules/employees/components/EmployeeFields'
import type { TerritorioCatalogo } from '@/modules/employees/types'
import { branchSchema, type Branch, type BranchBrand, type BranchInput } from './types'
import { saveBranch } from './actions'

export function BranchForm({
  branch,
  territorio,
  brands,
  defaultBrandId,
  listQuery = '',
}: {
  branch?: Branch
  territorio: TerritorioCatalogo
  brands: BranchBrand[]
  /** Marca preseleccionada al crear (viene de "Agregar sucursal" en una marca). */
  defaultBrandId?: number
  /** Filtro del listado del que se vino (`?marca=1`), para volver a él. */
  listQuery?: string
}) {
  const router = useRouter()
  // Se ofrecen las activas, más la que la sucursal ya tiene aunque se haya
  // desactivado: la RPC acepta conservarla, no elegirla de nuevo.
  const brandOptions = brands
    .filter((b) => b.activa || b.id === branch?.suc_marca_id)
    .map((b) => ({ id: b.id, nombre: b.activa ? b.nombre : `${b.nombre} (inactiva)` }))
  // La marca de la que se vino; o, al crear, la única que se puede elegir.
  const preselected = brandOptions.some((b) => b.id === defaultBrandId)
    ? defaultBrandId
    : !branch && brandOptions.length === 1
      ? brandOptions[0].id
      : undefined
  const [error, setError] = useState<string | null>(null)
  const methods = useForm<BranchInput>({
    unsavedLabel: 'la sucursal',
    resolver: zodResolver(branchSchema),
    defaultValues: {
      suc_nombre: branch?.suc_nombre ?? '',
      suc_marca_id: branch?.suc_marca_id ?? preselected,
      suc_codigo_interno: branch?.suc_codigo_interno ?? '',
      suc_telefono: branch?.suc_telefono ?? '',
      suc_email_sucursal: branch?.suc_email_sucursal ?? '',
      suc_latitud: branch?.suc_latitud ?? null,
      suc_longitud: branch?.suc_longitud ?? null,
      suc_radio_geocerca_metros: branch?.suc_radio_geocerca_metros ?? 50,
      suc_activa: branch?.suc_activa ?? true,
      direccion: branch?.direccion
        ? {
            dir_distrito_id: branch.direccion.dir_distrito_id,
            dir_senas_exactas: branch.direccion.dir_senas_exactas ?? '',
          }
        : { dir_senas_exactas: '' },
    },
  })
  const {
    register,
    handleSubmit,
    guard,
    formState: { errors, isSubmitting },
  } = methods
  const err = (name: string) => getFieldError(errors, name)
  async function submit(data: BranchInput) {
    setError(null)
    if (
      branch?.suc_activa &&
      !data.suc_activa &&
      !window.confirm(
        '¿Desactivar esta sucursal? Se conservará el historial y no podrá usarse para marcar. Debés resolver primero los contratos, turnos y kioscos pendientes.'
      )
    )
      return
    try {
      const r = await saveBranch(branch?.suc_id ?? null, data)
      if (!r.ok) {
        setError(r.error)
        return
      }
      guard.acceptChanges()
      router.push(`/settings/branches/${r.data}${listQuery}`)
      router.refresh()
    } catch {
      setError(
        'No se pudo confirmar el guardado. Revisá la conexión y el listado antes de volver a crear; tus datos siguen en el formulario.'
      )
    }
  }
  if (brandOptions.length === 0)
    return (
      <Alert>
        Antes de crear una sucursal necesitás una marca activa.{' '}
        <Link href="/settings/profile?tab=marcas" className="font-semibold underline">
          Ir a Marcas
        </Link>
      </Alert>
    )
  return (
    <FormProvider {...methods}>
      <form
        ref={(element) => guard.bindRoot(element)}
        onSubmit={handleSubmit(submit)}
        className="@container space-y-6"
        noValidate
      >
        {error && <Alert>{error}</Alert>}
        <fieldset
          disabled={isSubmitting}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-5"
        >
          <legend className="px-1 text-base font-bold text-slate-900">Datos de la sucursal</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <CatalogSelect name="suc_marca_id" label="Marca *" options={brandOptions} />
            <Labeled label="Nombre *" error={err('suc_nombre')}>
              <input
                {...register('suc_nombre')}
                className={INPUT_CLASSES}
                aria-invalid={!!err('suc_nombre')}
              />
            </Labeled>
            <Labeled label="Código interno" error={err('suc_codigo_interno')}>
              <input {...register('suc_codigo_interno')} className={INPUT_CLASSES} />
            </Labeled>
            <Labeled label="Teléfono" error={err('suc_telefono')}>
              <input {...register('suc_telefono')} type="tel" className={INPUT_CLASSES} />
            </Labeled>
            <Labeled label="Correo de contacto" error={err('suc_email_sucursal')}>
              <input {...register('suc_email_sucursal')} type="email" className={INPUT_CLASSES} />
            </Labeled>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input {...register('suc_activa')} type="checkbox" />
            Sucursal activa
          </label>
        </fieldset>
        <fieldset
          disabled={isSubmitting}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-5"
        >
          <legend className="px-1 text-base font-bold">Dirección</legend>
          <AddressFields basePath="direccion." territorio={territorio} />
        </fieldset>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Guardando…' : branch ? 'Guardar cambios' : 'Crear sucursal'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={isSubmitting}
            onClick={() => guard.confirmLeave(() => router.push(`/settings/branches${listQuery}`))}
          >
            Volver al listado
          </Button>
        </div>
      </form>
    </FormProvider>
  )
}
