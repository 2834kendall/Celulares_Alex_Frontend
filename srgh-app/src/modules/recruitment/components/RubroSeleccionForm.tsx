'use client'

import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ClipboardList, Loader2 } from 'lucide-react'
import { ColorPicker } from '@/components/ui/ColorPicker'
import {
  rubroSeleccionSchema,
  type RubroSeleccionInput,
  type RubroSeleccionRow,
} from '@/modules/recruitment/types'
import { createCriterioSeleccion } from '@/modules/recruitment/actions/createCriterioSeleccion'
import { updateCriterioSeleccion } from '@/modules/recruitment/actions/updateCriterioSeleccion'
import { Button } from '@/components/ui/Button'
import { FIELD_ERROR, INPUT, LABEL, SPINNER } from '@/components/ui/styles'
import { Alert } from '@/components/ui/Alert'

interface RubroSeleccionFormProps {
  // Si se pasa un rubro existente, el formulario entra en modo edición.
  rubro?: RubroSeleccionRow
  onSuccess?: () => void
}

/** Mismo formulario que RubroForm.tsx en evaluations, para el catálogo de criterios de selección. */
export function RubroSeleccionForm({ rubro, onSuccess }: RubroSeleccionFormProps) {
  const [serverError, setServerError] = useState<string | null>(null)
  const isEditing = Boolean(rubro)

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<RubroSeleccionInput>({
    resolver: zodResolver(rubroSeleccionSchema),
    defaultValues: rubro
      ? {
          nombre: rubro.nombre,
          descripcion: rubro.descripcion,
          color: rubro.color,
          peso: rubro.peso,
        }
      : { nombre: '', descripcion: '', color: null, peso: 1 },
  })

  // useWatch (no watch): watch() devuelve una función que el compilador de
  // React no puede memoizar — es la advertencia que ya arrastran
  // ScheduleForm y ConceptoForm. Acá se evita desde el principio.
  const colorValue = useWatch({ control, name: 'color' })

  async function onSubmit(input: RubroSeleccionInput) {
    setServerError(null)

    const result = isEditing
      ? await updateCriterioSeleccion(rubro!.areaId, rubro!.criterioId, input)
      : await createCriterioSeleccion(input)

    if (!result.ok) {
      setServerError(result.error)
      return
    }

    if (!isEditing) reset({ nombre: '', descripcion: '', color: null, peso: 1 })
    onSuccess?.()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
      {serverError && (
        <Alert>
          <div>{serverError}</div>
        </Alert>
      )}

      <div>
        <label className={LABEL} htmlFor="criterio_nombre">
          Nombre del criterio
        </label>
        <input
          id="criterio_nombre"
          disabled={isSubmitting}
          aria-invalid={!!errors.nombre}
          {...register('nombre')}
          className={INPUT}
          placeholder="Ej: Disponibilidad de horario"
        />
        {errors.nombre && <p className={FIELD_ERROR}>{errors.nombre.message}</p>}
      </div>

      <div>
        <label className={LABEL} htmlFor="criterio_descripcion">
          Descripción corta
        </label>
        <textarea
          id="criterio_descripcion"
          rows={3}
          disabled={isSubmitting}
          aria-invalid={!!errors.descripcion}
          {...register('descripcion')}
          className={`${INPUT} resize-none`}
          placeholder="Defina qué se califica con este criterio..."
        />
        {errors.descripcion && <p className={FIELD_ERROR}>{errors.descripcion.message}</p>}
      </div>

      <div>
        <label className={LABEL} htmlFor="criterio_peso">
          Peso
        </label>
        <p className="mb-1 text-[11px] text-slate-500">
          Cuánto vale este criterio frente a los demás. 1 = igual que el resto; 2 = vale el doble.
          El promedio del candidato se calcula con estos pesos.
        </p>
        <input
          id="criterio_peso"
          type="number"
          min={0.1}
          max={10}
          step={0.1}
          disabled={isSubmitting}
          aria-invalid={!!errors.peso}
          {...register('peso', { valueAsNumber: true })}
          className={`${INPUT} w-28`}
        />
        {errors.peso && <p className={FIELD_ERROR}>{errors.peso.message}</p>}
      </div>

      <ColorPicker
        value={colorValue}
        disabled={isSubmitting}
        onChange={(color) => setValue('color', color)}
        label="Color del criterio"
        description="Sirve para reconocerlo de un vistazo al calificar al candidato. Sin color propio se muestra en gris."
        emptyLabel="Sin color"
        storageKey="sgrh_criterios_custom_colors"
      />

      <Button type="submit" disabled={isSubmitting} size="lg" block>
        {isSubmitting ? (
          <>
            <Loader2 className={SPINNER} /> Guardando
          </>
        ) : (
          <>
            <ClipboardList className="h-3.5 w-3.5" />{' '}
            {isEditing ? 'Actualizar criterio' : 'Guardar criterio'}
          </>
        )}
      </Button>
    </form>
  )
}
