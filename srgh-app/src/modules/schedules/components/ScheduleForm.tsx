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
}

const INPUT_CLASSES =
  'w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-600/70 focus:border-indigo-600 transition disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 aria-[invalid=true]:border-rose-400 aria-[invalid=true]:focus:ring-rose-400/60'

const LABEL_CLASSES = 'block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1.5'

export function ScheduleForm({ schedule, tiposJornada }: ScheduleFormProps) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const isEditing = Boolean(schedule)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ScheduleInput>({
    resolver: zodResolver(scheduleSchema),
    defaultValues: schedule ?? {
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
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      {serverError && (
        <div
          role="alert"
          className="bg-rose-50 border border-rose-200 p-3.5 text-xs text-rose-800 rounded-xl flex gap-2.5 items-start"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500 mt-0.5" />
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

      <div className="grid grid-cols-2 gap-4">
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
            className={INPUT_CLASSES}
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
            className={INPUT_CLASSES}
          />
          {errors.hor_hora_salida && (
            <p className="mt-1.5 text-xs text-rose-600">{errors.hor_hora_salida.message}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
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
            className={INPUT_CLASSES}
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
            className={INPUT_CLASSES}
          />
          {errors.hor_hora_fin_almuerzo && (
            <p className="mt-1.5 text-xs text-rose-600">{errors.hor_hora_fin_almuerzo.message}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <input
          type="checkbox"
          id="hor_activo"
          disabled={isSubmitting}
          {...register('hor_activo')}
          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
        />
        <label htmlFor="hor_activo" className="text-sm text-slate-700">
          Plantilla activa
        </label>
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full py-3 rounded-xl text-white font-bold text-sm transition-all flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Guardando
          </>
        ) : (
          <>
            <Clock className="h-4 w-4" /> {isEditing ? 'Actualizar horario' : 'Crear horario'}
          </>
        )}
      </button>
    </form>
  )
}
