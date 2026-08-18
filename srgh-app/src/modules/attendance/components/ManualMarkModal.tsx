'use client'

import { type FormEvent, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { TimeSelect } from '@/components/ui/TimeSelect'
import { saveManualMark } from '@/modules/attendance/actions/saveManualMark'
import { manualMarkSchema } from '@/modules/attendance/types'
import type { MarkType } from '@/modules/attendance/lib/marks'
import { timeOfDay } from '@/modules/attendance/lib/time'
import { Button } from '@/components/ui/Button'
import { FIELD_ERROR, INPUT, LABEL, SPINNER } from '@/components/ui/styles'
import { Alert } from '@/components/ui/Alert'

const MARK_LABELS: Record<MarkType, string> = {
  entrada: 'Entrada',
  salida: 'Salida',
  inicio_almuerzo: 'Inicio de almuerzo',
  fin_almuerzo: 'Fin de almuerzo',
}

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
          <Alert>
            <div>{serverError}</div>
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={LABEL} htmlFor="manual-mark-fecha">
              Fecha del evento
            </label>
            <input
              id="manual-mark-fecha"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              disabled={isSaving}
              aria-invalid={!!errors.fecha}
              className={INPUT}
            />
            {errors.fecha && <p className={FIELD_ERROR}>{errors.fecha}</p>}
          </div>

          <div>
            <label className={LABEL}>Hora real del evento</label>
            <TimeSelect value={hora} onChange={setHora} />
            {errors.hora && <p className={FIELD_ERROR}>{errors.hora}</p>}
          </div>
        </div>

        <div>
          <label className={LABEL} htmlFor="manual-mark-observacion">
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
            className={INPUT}
          />
          {errors.observacion && <p className={FIELD_ERROR}>{errors.observacion}</p>}
        </div>

        <Button type="submit" disabled={isSaving} size="lg" block>
          {isSaving ? (
            <>
              <Loader2 className={SPINNER} /> Guardando
            </>
          ) : markId ? (
            'Guardar correccion'
          ) : (
            'Agregar marca'
          )}
        </Button>
      </form>
    </Modal>
  )
}
