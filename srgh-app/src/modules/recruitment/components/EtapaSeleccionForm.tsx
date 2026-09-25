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
import { FIELD_ERROR, INPUT, LABEL, SPINNER } from '@/components/ui/styles'
import { cn } from '@/lib/utils/cn'
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
  const faseValue = useWatch({ control, name: 'fase' })

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
        <span className={LABEL} id="etapa_fase_label">
          Columna del tablero
        </span>
        <p className="mb-1.5 text-[11px] text-slate-500" id="etapa_fase_ayuda">
          Dónde aparece el candidato mientras esté en esta etapa.
          {isEditing && ' Cambiarla mueve a todos los que estén parados acá.'}
        </p>
        {/* Tres columnas fijas: botones segmentados que se ven todos a la
            vez, en el mismo orden que el tablero. */}
        <div
          role="radiogroup"
          aria-labelledby="etapa_fase_label"
          aria-describedby="etapa_fase_ayuda"
          className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1"
        >
          {FASES_SELECCION.map((fase) => {
            const checked = faseValue === fase.value
            return (
              <button
                key={fase.value}
                type="button"
                role="radio"
                aria-checked={checked}
                disabled={isSubmitting}
                onClick={() => setValue('fase', fase.value, { shouldValidate: true })}
                className={cn(
                  'rounded-lg px-1 py-1.5 text-center text-xs leading-tight font-semibold outline-none transition pointer-coarse:min-h-11 sm:px-2 focus-visible:ring-2 focus-visible:ring-brand-500/60 active:scale-[0.97] motion-reduce:active:scale-100 disabled:cursor-not-allowed',
                  checked
                    ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
                    : 'text-slate-500 hover:text-slate-900'
                )}
              >
                {fase.label}
              </button>
            )
          })}
        </div>
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
