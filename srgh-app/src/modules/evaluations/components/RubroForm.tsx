'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, ClipboardList, Loader2 } from 'lucide-react'
import { rubroSchema, type RubroInput, type RubroRow } from '@/modules/evaluations/types'
import { createRubro } from '@/modules/evaluations/actions/createRubro'
import { updateRubro } from '@/modules/evaluations/actions/updateRubro'

interface RubroFormProps {
  // Si se pasa un rubro existente, el formulario entra en modo edicion.
  rubro?: RubroRow
  onSuccess?: () => void
}

const INPUT_CLASSES =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-600/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 aria-[invalid=true]:border-rose-400 aria-[invalid=true]:focus:ring-rose-400/20'

const LABEL_CLASSES = 'mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500'

export function RubroForm({ rubro, onSuccess }: RubroFormProps) {
  const [serverError, setServerError] = useState<string | null>(null)
  const isEditing = Boolean(rubro)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RubroInput>({
    resolver: zodResolver(rubroSchema),
    defaultValues: rubro
      ? { nombre: rubro.nombre, descripcion: rubro.descripcion }
      : { nombre: '', descripcion: '' },
  })

  async function onSubmit(input: RubroInput) {
    setServerError(null)

    const result = isEditing
      ? await updateRubro(rubro!.areaId, rubro!.criterioId, input)
      : await createRubro(input)

    if (!result.ok) {
      setServerError(result.error)
      return
    }

    // revalidatePath('/evaluations') en la accion ya refresca la ruta.
    if (!isEditing) reset({ nombre: '', descripcion: '' })
    onSuccess?.()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
      {serverError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />
          <div>{serverError}</div>
        </div>
      )}

      <div>
        <label className={LABEL_CLASSES} htmlFor="rubro_nombre">
          Nombre del rubro
        </label>
        <input
          id="rubro_nombre"
          disabled={isSubmitting}
          aria-invalid={!!errors.nombre}
          {...register('nombre')}
          className={INPUT_CLASSES}
          placeholder="Ej: Proactividad en Tienda"
        />
        {errors.nombre && <p className="mt-1.5 text-xs text-rose-600">{errors.nombre.message}</p>}
      </div>

      <div>
        <label className={LABEL_CLASSES} htmlFor="rubro_descripcion">
          Descripción corta
        </label>
        <textarea
          id="rubro_descripcion"
          rows={3}
          disabled={isSubmitting}
          aria-invalid={!!errors.descripcion}
          {...register('descripcion')}
          className={`${INPUT_CLASSES} resize-none`}
          placeholder="Defina qué se evalúa con este indicador..."
        />
        {errors.descripcion && (
          <p className="mt-1.5 text-xs text-rose-600">{errors.descripcion.message}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm outline-none transition-all hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Guardando
          </>
        ) : (
          <>
            <ClipboardList className="h-3.5 w-3.5" />{' '}
            {isEditing ? 'Actualizar rubro' : 'Guardar rubro'}
          </>
        )}
      </button>
    </form>
  )
}
