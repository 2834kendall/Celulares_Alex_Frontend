'use client'

import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Milestone } from 'lucide-react'
import {
  etapaSeleccionSchema,
  FASES_SELECCION,
  type EtapaSeleccionInput,
  type EtapaSeleccionRow,
} from '@/modules/recruitment/types'
import { createEtapaSeleccion } from '@/modules/recruitment/actions/createEtapaSeleccion'
import { updateEtapaSeleccion } from '@/modules/recruitment/actions/updateEtapaSeleccion'
import { ColorPicker } from '@/components/ui/ColorPicker'
import { Button } from '@/components/ui/Button'
import { FIELD_ERROR, INPUT, LABEL, SELECT, SPINNER } from '@/components/ui/styles'
import { Alert } from '@/components/ui/Alert'

interface EtapaSeleccionFormProps {
  etapa?: EtapaSeleccionRow
  onSuccess?: () => void
}

export function EtapaSeleccionForm({ etapa, onSuccess }: EtapaSeleccionFormProps) {
  const [serverError, setServerError] = useState<string | null>(null)
  const isEditing = Boolean(etapa)

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<EtapaSeleccionInput>({
    resolver: zodResolver(etapaSeleccionSchema),
    defaultValues: etapa
      ? { nombre: etapa.nombre, fase: etapa.fase, color: etapa.color }
      : { nombre: '', fase: 1, color: null },
  })

  const colorValue = useWatch({ control, name: 'color' })

  async function onSubmit(input: EtapaSeleccionInput) {
    setServerError(null)

    const result = isEditing
      ? await updateEtapaSeleccion(etapa!.id, input)
      : await createEtapaSeleccion(input)

    if (!result.ok) {
      setServerError(result.error)
      return
    }

    if (!isEditing) reset({ nombre: '', fase: 1, color: null })
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
        <label className={LABEL} htmlFor="etapa_nombre">
          Nombre de la etapa
        </label>
        <input
          id="etapa_nombre"
          disabled={isSubmitting}
          aria-invalid={!!errors.nombre}
          {...register('nombre')}
          className={INPUT}
          placeholder="Ej: Entrevista con el dueño"
        />
        {errors.nombre && <p className={FIELD_ERROR}>{errors.nombre.message}</p>}
      </div>

      <div>
        <label className={LABEL} htmlFor="etapa_fase">
          Columna del tablero
        </label>
        <p className="mb-1 text-[11px] text-slate-500">
          Dónde aparece el candidato mientras esté en esta etapa.
          {isEditing && ' Cambiarla mueve a todos los que estén parados acá.'}
        </p>
        <select
          id="etapa_fase"
          disabled={isSubmitting}
          aria-invalid={!!errors.fase}
          {...register('fase', { valueAsNumber: true })}
          className={SELECT}
        >
          {FASES_SELECCION.map((fase) => (
            <option key={fase.value} value={fase.value}>
              {fase.label}
            </option>
          ))}
        </select>
        {errors.fase && <p className={FIELD_ERROR}>{errors.fase.message}</p>}
      </div>

      <ColorPicker
        value={colorValue}
        disabled={isSubmitting}
        onChange={(color) => setValue('color', color)}
        label="Color de la etapa"
        description="Se usa en la tarjeta del tablero para reconocerla de un vistazo. Sin color propio se muestra en gris."
        emptyLabel="Sin color"
        storageKey="sgrh_etapas_custom_colors"
      />

      <Button type="submit" disabled={isSubmitting} size="lg" block>
        {isSubmitting ? (
          <>
            <Loader2 className={SPINNER} /> Guardando
          </>
        ) : (
          <>
            <Milestone className="h-3.5 w-3.5" /> {isEditing ? 'Actualizar etapa' : 'Guardar etapa'}
          </>
        )}
      </Button>
    </form>
  )
}
