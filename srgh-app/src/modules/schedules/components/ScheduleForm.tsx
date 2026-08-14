'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Clock, Loader2 } from 'lucide-react'
import { scheduleSchema, type ScheduleInput, type ScheduleRow } from '@/modules/schedules/types'
import { createSchedule } from '@/modules/schedules/actions/createSchedule'
import { updateSchedule } from '@/modules/schedules/actions/updateSchedule'
import { stripSeconds } from '@/modules/schedules/lib/time'
import { Button } from '@/components/ui/Button'
import { FIELD_ERROR, INPUT, LABEL, SPINNER } from '@/components/ui/styles'
import { Alert } from '@/components/ui/Alert'

interface ShiftTypeOption {
  tjo_id: number
  tjo_nombre: string
}

interface ScheduleFormProps {
  /** If an existing schedule is passed, the form enters edit mode. */
  schedule?: ScheduleRow
  shiftTypes: ShiftTypeOption[]
  /** Called after a successful save (create or update). */
  onSuccess?: () => void
}

export function ScheduleForm({ schedule, shiftTypes, onSuccess }: ScheduleFormProps) {
  const [serverError, setServerError] = useState<string | null>(null)
  const isEditing = Boolean(schedule)

  const [hasBreak, setHasBreak] = useState(
    Boolean(schedule?.hor_hora_inicio_break && schedule?.hor_hora_fin_break)
  )

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ScheduleInput>({
    resolver: zodResolver(scheduleSchema),
    defaultValues: schedule
      ? {
          ...schedule,
          hor_hora_entrada: stripSeconds(schedule.hor_hora_entrada),
          hor_hora_salida: stripSeconds(schedule.hor_hora_salida),
          hor_hora_inicio_almuerzo: stripSeconds(schedule.hor_hora_inicio_almuerzo),
          hor_hora_fin_almuerzo: stripSeconds(schedule.hor_hora_fin_almuerzo),
          hor_hora_inicio_break: schedule.hor_hora_inicio_break
            ? stripSeconds(schedule.hor_hora_inicio_break)
            : '',
          hor_hora_fin_break: schedule.hor_hora_fin_break
            ? stripSeconds(schedule.hor_hora_fin_break)
            : '',
        }
      : {
          hor_nombre: '',
          hor_tipo_jornada_id: shiftTypes[0]?.tjo_id ?? 0,
          hor_hora_entrada: '08:00',
          hor_hora_salida: '17:00',
          hor_hora_inicio_almuerzo: '12:00',
          hor_hora_fin_almuerzo: '13:00',
          hor_duracion_almuerzo_min: 60,
          hor_hora_inicio_break: '',
          hor_hora_fin_break: '',
          hor_duracion_break_min: 10,
          hor_activo: true,
        },
  })

  function toggleBreak(checked: boolean) {
    setHasBreak(checked)
    if (!checked) {
      setValue('hor_hora_inicio_break', '')
      setValue('hor_hora_fin_break', '')
    } else if (!getValues('hor_hora_inicio_break')) {
      setValue('hor_hora_inicio_break', '10:00')
      setValue('hor_hora_fin_break', '10:10')
    }
  }

  async function onSubmit(input: ScheduleInput) {
    setServerError(null)

    const result = isEditing
      ? await updateSchedule(schedule!.hor_id, input)
      : await createSchedule(input)

    if (!result.ok) {
      setServerError(result.error)
      return
    }

    // revalidatePath('/schedule') in the server action already refreshes the route.
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
        <label className={LABEL} htmlFor="hor_nombre">
          Nombre de la plantilla
        </label>
        <input
          id="hor_nombre"
          disabled={isSubmitting}
          aria-invalid={!!errors.hor_nombre}
          {...register('hor_nombre')}
          className={INPUT}
          placeholder="Turno Diurno Tienda"
        />
        {errors.hor_nombre && <p className={FIELD_ERROR}>{errors.hor_nombre.message}</p>}
      </div>

      <div>
        <label className={LABEL} htmlFor="hor_tipo_jornada_id">
          Tipo de jornada
        </label>
        <select
          id="hor_tipo_jornada_id"
          disabled={isSubmitting}
          aria-invalid={!!errors.hor_tipo_jornada_id}
          {...register('hor_tipo_jornada_id', { valueAsNumber: true })}
          className={INPUT}
        >
          {shiftTypes.map((shiftType) => (
            <option key={shiftType.tjo_id} value={shiftType.tjo_id}>
              {shiftType.tjo_nombre}
            </option>
          ))}
        </select>
        {errors.hor_tipo_jornada_id && (
          <p className={FIELD_ERROR}>{errors.hor_tipo_jornada_id.message}</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="hor_hora_entrada">
            Hora de entrada
          </label>
          <input
            type="time"
            id="hor_hora_entrada"
            disabled={isSubmitting}
            aria-invalid={!!errors.hor_hora_entrada}
            {...register('hor_hora_entrada')}
            className={`${INPUT} tabular-nums`}
          />
          {errors.hor_hora_entrada && (
            <p className={FIELD_ERROR}>{errors.hor_hora_entrada.message}</p>
          )}
        </div>

        <div>
          <label className={LABEL} htmlFor="hor_hora_salida">
            Hora de salida
          </label>
          <input
            type="time"
            id="hor_hora_salida"
            disabled={isSubmitting}
            aria-invalid={!!errors.hor_hora_salida}
            {...register('hor_hora_salida')}
            className={`${INPUT} tabular-nums`}
          />
          {errors.hor_hora_salida && (
            <p className={FIELD_ERROR}>{errors.hor_hora_salida.message}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="hor_hora_inicio_almuerzo">
            Inicio de almuerzo
          </label>
          <input
            type="time"
            id="hor_hora_inicio_almuerzo"
            disabled={isSubmitting}
            aria-invalid={!!errors.hor_hora_inicio_almuerzo}
            {...register('hor_hora_inicio_almuerzo')}
            className={`${INPUT} tabular-nums`}
          />
          {errors.hor_hora_inicio_almuerzo && (
            <p className={FIELD_ERROR}>{errors.hor_hora_inicio_almuerzo.message}</p>
          )}
        </div>

        <div>
          <label className={LABEL} htmlFor="hor_hora_fin_almuerzo">
            Fin de almuerzo
          </label>
          <input
            type="time"
            id="hor_hora_fin_almuerzo"
            disabled={isSubmitting}
            aria-invalid={!!errors.hor_hora_fin_almuerzo}
            {...register('hor_hora_fin_almuerzo')}
            className={`${INPUT} tabular-nums`}
          />
          {errors.hor_hora_fin_almuerzo && (
            <p className={FIELD_ERROR}>{errors.hor_hora_fin_almuerzo.message}</p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 p-3">
        <label
          htmlFor="hor_tiene_break"
          className="flex cursor-pointer select-none items-center gap-3"
        >
          <span className="relative inline-flex h-5 w-9 shrink-0 items-center">
            <input
              type="checkbox"
              id="hor_tiene_break"
              disabled={isSubmitting}
              checked={hasBreak}
              onChange={(event) => toggleBreak(event.target.checked)}
              className="peer sr-only"
            />
            <span className="absolute inset-0 rounded-full bg-slate-200 transition-colors peer-checked:bg-blue-600 peer-disabled:opacity-50 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 peer-focus-visible:ring-offset-2" />
            <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4" />
          </span>
          <span className="text-xs text-slate-700 sm:text-sm">
            Incluye break adicional al almuerzo
          </span>
        </label>

        {hasBreak && (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={LABEL} htmlFor="hor_hora_inicio_break">
                Inicio de break
              </label>
              <input
                type="time"
                id="hor_hora_inicio_break"
                disabled={isSubmitting}
                aria-invalid={!!errors.hor_hora_inicio_break}
                {...register('hor_hora_inicio_break')}
                className={`${INPUT} tabular-nums`}
              />
              {errors.hor_hora_inicio_break && (
                <p className={FIELD_ERROR}>{errors.hor_hora_inicio_break.message}</p>
              )}
            </div>

            <div>
              <label className={LABEL} htmlFor="hor_hora_fin_break">
                Fin de break
              </label>
              <input
                type="time"
                id="hor_hora_fin_break"
                disabled={isSubmitting}
                aria-invalid={!!errors.hor_hora_fin_break}
                {...register('hor_hora_fin_break')}
                className={`${INPUT} tabular-nums`}
              />
              {errors.hor_hora_fin_break && (
                <p className={FIELD_ERROR}>{errors.hor_hora_fin_break.message}</p>
              )}
            </div>
          </div>
        )}
      </div>

      <label
        htmlFor="hor_activo"
        className="flex cursor-pointer select-none items-center gap-3 pt-1"
      >
        <span className="relative inline-flex h-5 w-9 shrink-0 items-center">
          <input
            type="checkbox"
            id="hor_activo"
            disabled={isSubmitting}
            {...register('hor_activo')}
            className="peer sr-only"
          />
          <span className="absolute inset-0 rounded-full bg-slate-200 transition-colors peer-checked:bg-blue-600 peer-disabled:opacity-50 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 peer-focus-visible:ring-offset-2" />
          <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4" />
        </span>
        <span className="text-xs text-slate-700 sm:text-sm">Plantilla activa</span>
      </label>

      <Button type="submit" disabled={isSubmitting} size="lg" block>
        {isSubmitting ? (
          <>
            <Loader2 className={SPINNER} /> Guardando
          </>
        ) : (
          <>
            <Clock className="h-3.5 w-3.5" /> {isEditing ? 'Actualizar horario' : 'Crear horario'}
          </>
        )}
      </Button>
    </form>
  )
}
