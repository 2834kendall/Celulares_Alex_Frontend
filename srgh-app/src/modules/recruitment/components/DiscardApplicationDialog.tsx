'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { rejectPostulacion } from '@/modules/recruitment/actions/rejectPostulacion'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { INPUT, LABEL, SPINNER } from '@/components/ui/styles'

interface DiscardApplicationDialogProps {
  applicationId: number
  /** Para el subtítulo: a quién se está descartando. */
  candidateName?: string
  onClose: () => void
  /** Después de descartar con éxito (el diálogo ya se cerró). */
  onDone?: () => void
}

/**
 * Descartar una postulación pidiendo el motivo. Lo abren la ficha del
 * candidato, el menú de la tarjeta y la zona "Descartar" del tablero: el
 * motivo es obligatorio en los tres caminos, por eso vive en un solo lugar.
 */
export function DiscardApplicationDialog({
  applicationId,
  candidateName,
  onClose,
  onDone,
}: DiscardApplicationDialogProps) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (reason.trim().length < 3) {
      setError('Describe brevemente el motivo.')
      return
    }
    setSubmitting(true)
    setError(null)
    const result = await rejectPostulacion({ postulacionId: applicationId, motivo: reason.trim() })
    setSubmitting(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    toast.success('Postulación descartada.')
    onClose()
    onDone?.()
  }

  return (
    <Modal
      title={candidateName ? `Descartar a ${candidateName}` : 'Descartar postulación'}
      subtitle="Indica el motivo del descarte. No se puede deshacer."
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-3" noValidate>
        {error && (
          <Alert>
            <div>{error}</div>
          </Alert>
        )}
        <div>
          <label className={LABEL} htmlFor={`discard-reason-${applicationId}`}>
            Motivo del descarte
          </label>
          <input
            id={`discard-reason-${applicationId}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={submitting}
            className={INPUT}
            placeholder="Ej: no tiene disponibilidad los fines de semana"
            autoFocus
          />
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" size="lg" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="submit" variant="danger" disabled={submitting} size="lg">
            {submitting && <Loader2 className={SPINNER} />} Descartar postulación
          </Button>
        </div>
      </form>
    </Modal>
  )
}
