'use client'

import { type FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { FIELD_ERROR, INPUT, LABEL, SPINNER } from '@/components/ui/styles'
import { createAusencia } from '@/modules/absences/actions/createAusencia'
import { getAusenciaTypes } from '@/modules/absences/actions/getAusenciaTypes'
import type { AusenciaTypeRow } from '@/modules/absences/types'

interface JustifyAbsenceModalProps {
  employmentHistoryId: number
  employeeName: string
  /** Dia de la ausencia, "YYYY-MM-DD". */
  dateISO: string
  onClose: () => void
}

function formatDay(dateISO: string) {
  return new Intl.DateTimeFormat('es-CR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${dateISO}T00:00:00`))
}

/**
 * Justifica un dia de ausencia registrando una ausencia APROBADA de un solo
 * dia (permiso, cita medica, incapacidad...), la misma que se crea desde el
 * panel de ausencias en Horarios. No hay una "justificacion" aparte: el
 * reporte ya descuenta los dias cubiertos por una ausencia aprobada, y asi la
 * nomina recibe el mismo registro que recibiria desde Horarios.
 *
 * Los tipos intradia (lactancia) se excluyen: se miden en horas dentro de un
 * dia trabajado, no cubren un dia completo sin marcar.
 */
export function JustifyAbsenceModal({
  employmentHistoryId,
  employeeName,
  dateISO,
  onClose,
}: JustifyAbsenceModalProps) {
  const router = useRouter()
  const [tipos, setTipos] = useState<AusenciaTypeRow[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tipoId, setTipoId] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [boleta, setBoleta] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    getAusenciaTypes().then((result) => {
      if (cancelled) return
      if (result.ok) setTipos(result.data.filter((t) => !t.tau_es_intradia))
      else setLoadError(result.error)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const selected = tipos?.find((t) => String(t.tau_id) === tipoId) ?? null

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setFieldError(null)
    setServerError(null)

    if (!selected) {
      setFieldError('Selecciona el tipo de ausencia.')
      return
    }

    setIsSaving(true)
    const result = await createAusencia({
      employmentHistoryId,
      tipoAusenciaId: selected.tau_id,
      fechaInicio: dateISO,
      fechaFin: dateISO,
      numeroBoletaCcss: selected.tau_requiere_documento_ccss ? boleta : undefined,
      observaciones: observaciones || undefined,
    })
    setIsSaving(false)

    if (!result.ok) {
      setServerError(result.error)
      return
    }

    toast.success('Ausencia justificada.')
    router.refresh()
    onClose()
  }

  return (
    <Modal
      title="Justificar ausencia"
      subtitle={`${employeeName} — ${formatDay(dateISO)}`}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-3" noValidate>
        {(serverError || loadError) && (
          <Alert>
            <div>{serverError ?? loadError}</div>
          </Alert>
        )}

        <p className="text-sm text-slate-600">
          Registra el motivo por el que no vino. El dia deja de contar como ausencia y queda
          registrado en Horarios y en la nomina como cualquier otra ausencia.
        </p>

        <div>
          <label className={LABEL} htmlFor="ausencia-tipo">
            Tipo de ausencia
          </label>
          {/* SelectMenu y no <select>: la lista del select nativo la dibuja
              el sistema operativo, sin estilos, y con 15 tipos se abria
              encima del modal. */}
          <SelectMenu
            id="ausencia-tipo"
            value={tipoId}
            onChange={setTipoId}
            disabled={isSaving || !tipos}
            invalid={!!fieldError}
            placeholder={tipos ? 'Selecciona un tipo' : 'Cargando tipos…'}
            options={(tipos ?? []).map((t) => ({ value: String(t.tau_id), label: t.tau_nombre }))}
          />
          {fieldError && <p className={FIELD_ERROR}>{fieldError}</p>}
        </div>

        {selected?.tau_requiere_documento_ccss && (
          <div>
            <label className={LABEL} htmlFor="ausencia-boleta">
              Numero de boleta CCSS
            </label>
            <input
              id="ausencia-boleta"
              value={boleta}
              onChange={(e) => setBoleta(e.target.value)}
              disabled={isSaving}
              maxLength={50}
              className={INPUT}
            />
          </div>
        )}

        <div>
          <label className={LABEL} htmlFor="ausencia-observaciones">
            Observaciones (opcional)
          </label>
          <textarea
            id="ausencia-observaciones"
            rows={3}
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            disabled={isSaving}
            maxLength={300}
            placeholder="Ej. aviso por telefono, trae el comprobante el lunes."
            className={INPUT}
          />
        </div>

        <Button type="submit" disabled={isSaving || !tipos} size="lg" block>
          {isSaving ? (
            <>
              <Loader2 className={SPINNER} /> Guardando
            </>
          ) : (
            'Justificar ausencia'
          )}
        </Button>
      </form>
    </Modal>
  )
}
