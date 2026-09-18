'use client'

import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Check, Clock, Loader2 } from 'lucide-react'
import {
  tipoTardiaSchema,
  type TipoTardiaInput,
  type TipoTardiaRow,
} from '@/modules/settings/types'
import { createTipoTardia } from '@/modules/settings/actions/createTipoTardia'
import { updateTipoTardia } from '@/modules/settings/actions/updateTipoTardia'
import { Button } from '@/components/ui/Button'
import { FIELD_ERROR, INPUT, LABEL, SPINNER } from '@/components/ui/styles'
import { Alert } from '@/components/ui/Alert'

/**
 * Colores con tono de "alerta" de menor a mayor, mas un par neutro. Propios
 * de este modulo a proposito: el selector de color de horarios vive en
 * modules/schedules, y cada modulo de negocio es independiente.
 */
const PRESETS = [
  { hex: '#F59E0B', nombre: 'Ambar' },
  { hex: '#EA580C', nombre: 'Naranja' },
  { hex: '#E11D48', nombre: 'Rosa' },
  { hex: '#DC2626', nombre: 'Rojo' },
  { hex: '#7C3AED', nombre: 'Violeta' },
  { hex: '#0284C7', nombre: 'Azul' },
  { hex: '#64748B', nombre: 'Gris' },
]

interface TipoTardiaFormProps {
  /** Si se pasa un tipo existente, el formulario entra en modo edicion. */
  tipo?: TipoTardiaRow
  onSuccess?: () => void
}

export function TipoTardiaForm({ tipo, onSuccess }: TipoTardiaFormProps) {
  const [serverError, setServerError] = useState<string | null>(null)
  const isEditing = Boolean(tipo)

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TipoTardiaInput>({
    resolver: zodResolver(tipoTardiaSchema),
    defaultValues: tipo
      ? {
          tta_nombre: tipo.tta_nombre,
          tta_desde_minutos: tipo.tta_desde_minutos,
          tta_cuenta_advertencia: tipo.tta_cuenta_advertencia,
          tta_color: tipo.tta_color,
        }
      : {
          tta_nombre: '',
          tta_desde_minutos: undefined,
          tta_cuenta_advertencia: true,
          tta_color: null,
        },
  })

  async function onSubmit(input: TipoTardiaInput) {
    setServerError(null)

    const result = isEditing
      ? await updateTipoTardia(tipo!.tta_id, input)
      : await createTipoTardia(input)

    if (!result.ok) {
      setServerError(result.error)
      return
    }

    // revalidatePath('/settings') en el server action ya refresca la ruta.
    onSuccess?.()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
      {serverError && (
        <Alert>
          <div>{serverError}</div>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="tta_nombre">
            Nombre
          </label>
          <input
            id="tta_nombre"
            disabled={isSubmitting}
            aria-invalid={!!errors.tta_nombre}
            {...register('tta_nombre')}
            className={INPUT}
            placeholder="Tardia leve"
          />
          {errors.tta_nombre && <p className={FIELD_ERROR}>{errors.tta_nombre.message}</p>}
        </div>

        <div>
          <label className={LABEL} htmlFor="tta_desde_minutos">
            Empieza en el minuto
          </label>
          <input
            id="tta_desde_minutos"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            disabled={isSubmitting}
            aria-invalid={!!errors.tta_desde_minutos}
            aria-describedby="tta_desde_minutos_ayuda"
            {...register('tta_desde_minutos', { valueAsNumber: true })}
            className={`${INPUT} tabular-nums`}
            placeholder="1"
          />
          <p id="tta_desde_minutos_ayuda" className="mt-1 text-[11px] text-slate-500">
            Llega hasta un minuto antes de que empiece el tipo siguiente.
          </p>
          {errors.tta_desde_minutos && (
            <p className={FIELD_ERROR}>{errors.tta_desde_minutos.message}</p>
          )}
        </div>
      </div>

      <Controller
        control={control}
        name="tta_color"
        render={({ field }) => (
          <fieldset>
            <legend className={LABEL}>Color</legend>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                aria-label="Color por defecto"
                aria-pressed={!field.value}
                disabled={isSubmitting}
                onClick={() => field.onChange(null)}
                className={`flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-slate-300 bg-white transition disabled:opacity-50 ${
                  !field.value ? 'ring-2 ring-slate-400 ring-offset-1' : 'hover:border-slate-400'
                }`}
              >
                {!field.value && <Check className="h-3.5 w-3.5 text-slate-600" strokeWidth={3} />}
              </button>
              {PRESETS.map((preset) => {
                const selected = field.value?.toLowerCase() === preset.hex.toLowerCase()
                return (
                  <button
                    key={preset.hex}
                    type="button"
                    aria-label={preset.nombre}
                    aria-pressed={selected}
                    disabled={isSubmitting}
                    onClick={() => field.onChange(preset.hex)}
                    style={{ backgroundColor: preset.hex }}
                    className={`flex h-7 w-7 items-center justify-center rounded-full border border-black/10 transition disabled:opacity-50 ${
                      selected ? 'ring-2 ring-slate-400 ring-offset-1' : ''
                    }`}
                  >
                    {selected && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
                  </button>
                )
              })}
              <label
                className="relative flex h-7 cursor-pointer items-center rounded-full border border-dashed border-slate-300 px-2.5 text-[11px] font-medium text-slate-500 transition hover:border-brand-400 hover:text-brand-700"
                title="Elegir otro color"
              >
                Otro
                <input
                  type="color"
                  value={field.value ?? '#F59E0B'}
                  disabled={isSubmitting}
                  onChange={(event) => field.onChange(event.target.value.toUpperCase())}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
              </label>
            </div>
            {errors.tta_color && <p className={FIELD_ERROR}>{errors.tta_color.message}</p>}
          </fieldset>
        )}
      />

      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          disabled={isSubmitting}
          {...register('tta_cuenta_advertencia')}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/40"
        />
        <span>
          <span className="font-medium">Cuenta para la advertencia del mes</span>
          <span className="block text-[11px] text-slate-500">
            Si lo desmarcás, este tipo se sigue viendo en el reporte, pero no suma para las 3
            tardías que disparan la advertencia.
          </span>
        </span>
      </label>

      <Button type="submit" disabled={isSubmitting} size="lg" block>
        {isSubmitting ? (
          <>
            <Loader2 className={SPINNER} /> Guardando
          </>
        ) : (
          <>
            <Clock className="h-3.5 w-3.5" /> {isEditing ? 'Actualizar tipo' : 'Crear tipo'}
          </>
        )}
      </Button>
    </form>
  )
}
