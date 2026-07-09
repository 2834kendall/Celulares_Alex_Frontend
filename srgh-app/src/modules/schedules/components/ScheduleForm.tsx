'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, Clock, Loader2 } from 'lucide-react'
import { scheduleSchema, type ScheduleInput, type ScheduleRow } from '@/modules/schedules/types'
import { createSchedule } from '@/modules/schedules/actions/createSchedule'
import { updateSchedule } from '@/modules/schedules/actions/updateSchedule'

interface TipoJornada {
  tjo_id: number
  tjo_nombre: string
}

interface ScheduleFormProps {
  /** Si viene un horario existente, el form entra en modo edicion. */
  schedule?: ScheduleRow
  tiposJornada: TipoJornada[]
  /** Se llama despues de guardar exitosamente (crear o actualizar). */
  onSuccess?: () => void
}

const INPUT_CLASSES =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-600/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 aria-[invalid=true]:border-rose-400 aria-[invalid=true]:focus:ring-rose-400/20'

const LABEL_CLASSES = 'mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500'

function stripSeconds(time: string) {
  return time.slice(0, 5)
}

export function ScheduleForm({ schedule, tiposJornada, onSuccess }: ScheduleFormProps) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const isEditing = Boolean(schedule)

  const {
    register,
    handleSubmit,
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
            : schedule.hor_hora_inicio_break,
          hor_hora_fin_break: schedule.hor_hora_fin_break
            ? stripSeconds(schedule.hor_hora_fin_break)
            : schedule.hor_hora_fin_break,
        }
      : {
          hor_nombre: '',
          hor_tipo_jornada_id: tiposJornada[0]?.tjo_id ?? 0,
          hor_hora_entrada: '08:00',
          hor_hora_salida: '17:00',
          hor_hora_inicio_almuerzo: '12:00',
          hor_hora_fin_almuerzo: '13:00',
          hor_duracion_almuerzo_min: 60,
          hor_duracion_break_min: 15,
          hor_activo: true,
        },
  })

  async function onSubmit(input: ScheduleInput) {
    setServerError(null)

    const result = isEditing
      ? await updateSchedule(schedule!.hor_id, input)
      : await createSchedule(input)

    if (!result.ok) {
      setServerError(result.error)
      return
    }

    router.refresh()
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
        <label className={LABEL_CLASSES} htmlFor="hor_nombre">
          Nombre de la plantilla
        </label>
        <input
          id="hor_nombre"
          disabled={isSubmitting}
          aria-invalid={!!errors.hor_nombre}
          {...register('hor_nombre')}
          className={INPUT_CLASSES}
          placeholder="Turno Diurno Tienda"
        />
        {errors.hor_nombre && (
          <p className="mt-1.5 text-xs text-rose-600">{errors.hor_nombre.message}</p>
        )}
      </div>

      <div>
        <label className={LABEL_CLASSES} htmlFor="hor_tipo_jornada_id">
          Tipo de jornada
        </label>
        <select
          id="hor_tipo_jornada_id"
          disabled={isSubmitting}
          aria-invalid={!!errors.hor_tipo_jornada_id}
          {...register('hor_tipo_jornada_id', { valueAsNumber: true })}
          className={INPUT_CLASSES}
        >
          {tiposJornada.map((tipo) => (
            <option key={tipo.tjo_id} value={tipo.tjo_id}>
              {tipo.tjo_nombre}
            </option>
          ))}
        </select>
        {errors.hor_tipo_jornada_id && (
          <p className="mt-1.5 text-xs text-rose-600">{errors.hor_tipo_jornada_id.message}</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={LABEL_CLASSES} htmlFor="hor_hora_entrada">
            Hora de entrada
          </label>
          <input
            type="time"
            id="hor_hora_entrada"
            disabled={isSubmitting}
            aria-invalid={!!errors.hor_hora_entrada}
            {...register('hor_hora_entrada')}
            className={`${INPUT_CLASSES} tabular-nums`}
          />
          {errors.hor_hora_entrada && (
            <p className="mt-1.5 text-xs text-rose-600">{errors.hor_hora_entrada.message}</p>
          )}
        </div>

        <div>
          <label className={LABEL_CLASSES} htmlFor="hor_hora_salida">
            Hora de salida
          </label>
          <input
            type="time"
            id="hor_hora_salida"
            disabled={isSubmitting}
            aria-invalid={!!errors.hor_hora_salida}
            {...register('hor_hora_salida')}
            className={`${INPUT_CLASSES} tabular-nums`}
          />
          {errors.hor_hora_salida && (
            <p className="mt-1.5 text-xs text-rose-600">{errors.hor_hora_salida.message}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={LABEL_CLASSES} htmlFor="hor_hora_inicio_almuerzo">
            Inicio de almuerzo
          </label>
          <input
            type="time"
            id="hor_hora_inicio_almuerzo"
            disabled={isSubmitting}
            aria-invalid={!!errors.hor_hora_inicio_almuerzo}
            {...register('hor_hora_inicio_almuerzo')}
            className={`${INPUT_CLASSES} tabular-nums`}
          />
          {errors.hor_hora_inicio_almuerzo && (
            <p className="mt-1.5 text-xs text-rose-600">
              {errors.hor_hora_inicio_almuerzo.message}
            </p>
          )}
        </div>

        <div>
          <label className={LABEL_CLASSES} htmlFor="hor_hora_fin_almuerzo">
            Fin de almuerzo
          </label>
          <input
            type="time"
            id="hor_hora_fin_almuerzo"
            disabled={isSubmitting}
            aria-invalid={!!errors.hor_hora_fin_almuerzo}
            {...register('hor_hora_fin_almuerzo')}
            className={`${INPUT_CLASSES} tabular-nums`}
          />
          {errors.hor_hora_fin_almuerzo && (
            <p className="mt-1.5 text-xs text-rose-600">{errors.hor_hora_fin_almuerzo.message}</p>
          )}
        </div>
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
          <span className="absolute inset-0 rounded-full bg-slate-200 transition-colors peer-checked:bg-blue-600 peer-disabled:opacity-50" />
          <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4" />
        </span>
        <span className="text-xs text-slate-700 sm:text-sm">Plantilla activa</span>
      </label>

      <button
        type="submit"
        disabled={isSubmitting}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Guardando
          </>
        ) : (
          <>
            <Clock className="h-3.5 w-3.5" /> {isEditing ? 'Actualizar horario' : 'Crear horario'}
          </>
        )}
      </button>
    </form>
  )
}
