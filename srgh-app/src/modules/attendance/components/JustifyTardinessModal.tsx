'use client'

import { type FormEvent, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { justifyTardiness } from '@/modules/attendance/actions/justifyTardiness'
import { justifyTardinessSchema } from '@/modules/attendance/types'
import { FIELD_ERROR, INPUT, LABEL, SPINNER } from '@/components/ui/styles'
import { Alert } from '@/components/ui/Alert'

interface JustifyTardinessModalProps {
  /** mar_id de la marca de entrada que llego tarde. */
  markId: number
  employeeName: string
  /** Dia de la tardanza, "YYYY-MM-DD" — solo para encabezar el modal. */
  dateISO: string
  /** Nombre del tipo de tardia del catalogo, ej. "Tardia grave". */
  tipoNombre: string
  diffMinutes: number
  /** Ya estaba justificada: el modal pasa a ofrecer retirarla. */
  isJustified: boolean
  /** Motivo guardado, para no obligar a reescribirlo al corregir el texto. */
  currentJustification: string | null
  onClose: () => void
  onSuccess?: () => void
}

function formatDay(dateISO: string) {
  return new Intl.DateTimeFormat('es-CR', { day: '2-digit', month: 'long' }).format(
    new Date(`${dateISO}T00:00:00`)
  )
}

/**
 * Declara que una tardanza no es responsabilidad del colaborador: el sistema
 * fallo y no pudo marcar estando ya en tienda, o cualquier otro caso que el
 * encargado analice (SGRH-87).
 *
 * El mismo modal retira la justificacion, porque es la misma decision vista al
 * reves y separarla en dos pantallas obligaria a buscar donde se deshace.
 *
 * Sin react-hook-form, igual que ManualMarkModal: es un unico campo de texto y
 * el esquema de zod ya valida lo mismo del lado del servidor.
 */
export function JustifyTardinessModal({
  markId,
  employeeName,
  dateISO,
  tipoNombre,
  diffMinutes,
  isJustified,
  currentJustification,
  onClose,
  onSuccess,
}: JustifyTardinessModalProps) {
  const [motivo, setMotivo] = useState(currentJustification ?? '')
  const [error, setError] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  async function submit(justificada: boolean) {
    setError(null)
    setServerError(null)

    const parsed = justifyTardinessSchema.safeParse({
      markId,
      justificada,
      motivo: justificada ? motivo : null,
    })

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Datos invalidos.')
      return
    }

    setIsSaving(true)
    const result = await justifyTardiness(parsed.data)
    setIsSaving(false)

    if (!result.ok) {
      setServerError(result.error)
      return
    }

    toast.success(justificada ? 'Tardanza justificada.' : 'Justificacion retirada.')
    onSuccess?.()
    onClose()
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    void submit(true)
  }

  return (
    <Modal
      title={isJustified ? 'Tardanza justificada' : 'Justificar tardanza'}
      subtitle={`${employeeName} — ${formatDay(dateISO)}`}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-3" noValidate>
        {serverError && (
          <Alert>
            <div>{serverError}</div>
          </Alert>
        )}

        <p className="text-sm text-slate-600">
          {tipoNombre} de <span className="font-semibold tabular-nums">{diffMinutes} min</span>.
          Justificarla la deja visible en el reporte, pero deja de contar para el mes.
        </p>

        <div>
          <label className={LABEL} htmlFor="justificacion-motivo">
            Motivo (obligatorio)
          </label>
          <textarea
            id="justificacion-motivo"
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            disabled={isSaving}
            aria-invalid={!!error}
            placeholder="Ej. el sistema estaba caido y no pudo marcar, ya estaba en tienda."
            className={INPUT}
          />
          {error && <p className={FIELD_ERROR}>{error}</p>}
        </div>

        <Button type="submit" disabled={isSaving} size="lg" block>
          {isSaving ? (
            <>
              <Loader2 className={SPINNER} /> Guardando
            </>
          ) : isJustified ? (
            'Actualizar motivo'
          ) : (
            'Justificar tardanza'
          )}
        </Button>

        {isJustified && (
          <Button
            type="button"
            variant="secondary"
            size="lg"
            block
            disabled={isSaving}
            onClick={() => void submit(false)}
          >
            Retirar justificacion
          </Button>
        )}
      </form>
    </Modal>
  )
}
