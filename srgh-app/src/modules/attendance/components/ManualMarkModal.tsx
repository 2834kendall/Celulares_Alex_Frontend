'use client'

import { type FormEvent, useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/modules/attendance/components/Modal'
import { TimeSelect } from '@/modules/attendance/components/TimeSelect'
import { saveManualMark } from '@/modules/attendance/actions/saveManualMark'
import { manualMarkSchema } from '@/modules/attendance/types'
import type { MarkType } from '@/modules/attendance/lib/marks'
import { timeOfDay } from '@/modules/attendance/lib/time'

const MARK_LABELS: Record<MarkType, string> = {
  ENTRADA: 'Entrada',
  SALIDA: 'Salida',
  INICIO_ALMUERZO: 'Inicio de almuerzo',
  FIN_ALMUERZO: 'Fin de almuerzo',
}

const INPUT_CLASSES =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 disabled:cursor-not-allowed disabled:bg-slate-50 aria-[invalid=true]:border-rose-400'

const LABEL_CLASSES = 'mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500'

interface ManualMarkModalProps {
  employmentHistoryId: number
  employeeId: number
  employeeName: string
  sucursalId: number
  tipo: MarkType
  /** Fila que se corrige, o null si se esta agregando una marca que no existia. */
  markId: number | null
  /** "YYYY-MM-DD HH:mm:ss" de la marca actual, si existe (prellena el formulario). */
  currentFechaHora: string | null
  /** El dia que se esta viendo en el panel — valor inicial de la fecha. */
  defaultDateISO: string
  onClose: () => void
  onSuccess?: () => void
}

/**
 * Corregir una marca existente o agregar una que nunca se registro.
 * Deliberadamente NO usa react-hook-form: TimeSelect es un control propio,
 * no un <input> nativo, y CustomHoursModal (el sibling mas cercano que
 * combina TimeSelect + modal) ya resuelve esto con estado simple en vez de
 * Controller — se sigue ese mismo patron aca por consistencia.
 */
export function ManualMarkModal({
  employmentHistoryId,
  employeeId,
  employeeName,
  sucursalId,
  tipo,
  markId,
  currentFechaHora,
  defaultDateISO,
  onClose,
  onSuccess,
}: ManualMarkModalProps) {
  const [fecha, setFecha] = useState(
    currentFechaHora ? currentFechaHora.split(' ')[0] : defaultDateISO
  )
  const [hora, setHora] = useState(currentFechaHora ? timeOfDay(currentFechaHora) : '08:00')
  const [observacion, setObservacion] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setServerError(null)

    const parsed = manualMarkSchema.safeParse({
      markId,
      employmentHistoryId,
      employeeId,
      sucursalId,
      tipo,
      fecha,
      hora,
      observacion,
    })

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0])
        if (!fieldErrors[key]) fieldErrors[key] = issue.message
      }
      setErrors(fieldErrors)
      return
    }

    setErrors({})
    setIsSaving(true)
    const result = await saveManualMark(parsed.data)
    setIsSaving(false)

    if (!result.ok) {
      setServerError(result.error)
      return
    }

    toast.success(markId ? 'Marca corregida correctamente.' : 'Marca agregada correctamente.')
    onSuccess?.()
    onClose()
  }

  return (
    <Modal
      title={markId ? 'Corregir marca' : 'Agregar marca'}
      subtitle={`${employeeName} — ${MARK_LABELS[tipo]}`}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-3" noValidate>
        {serverError && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />
            <div>{serverError}</div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={LABEL_CLASSES} htmlFor="manual-mark-fecha">
              Fecha del evento
            </label>
            <input
              id="manual-mark-fecha"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              disabled={isSaving}
              aria-invalid={!!errors.fecha}
              className={INPUT_CLASSES}
            />
            {errors.fecha && <p className="mt-1.5 text-xs text-rose-600">{errors.fecha}</p>}
          </div>

          <div>
            <label className={LABEL_CLASSES}>Hora real del evento</label>
            <TimeSelect value={hora} onChange={setHora} />
            {errors.hora && <p className="mt-1.5 text-xs text-rose-600">{errors.hora}</p>}
          </div>
        </div>

        <div>
          <label className={LABEL_CLASSES} htmlFor="manual-mark-observacion">
            Justificacion (obligatoria)
          </label>
          <textarea
            id="manual-mark-observacion"
            rows={3}
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
            disabled={isSaving}
            aria-invalid={!!errors.observacion}
            placeholder="Explique por que se registra o corrige esta marca..."
            className={INPUT_CLASSES}
          />
          {errors.observacion && (
            <p className="mt-1.5 text-xs text-rose-600">{errors.observacion}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isSaving}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm outline-none transition-all hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Guardando
            </>
          ) : markId ? (
            'Guardar correccion'
          ) : (
            'Agregar marca'
          )}
        </button>
      </form>
    </Modal>
  )
}
