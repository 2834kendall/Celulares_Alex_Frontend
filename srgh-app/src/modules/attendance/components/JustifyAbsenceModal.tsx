'use client'

import { useUnsavedChanges } from '@/hooks/useUnsavedChanges'

import { type FormEvent, useEffect, useState } from 'react'
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
import { justifySecondBlock } from '@/modules/attendance/actions/justifySecondBlock'

interface JustifyAbsenceModalProps {
  employmentHistoryId: number
  employeeName: string
  /** Dia de la ausencia, "YYYY-MM-DD". */
  dateISO: string
  block?: 'segundo'
  onClose: () => void
}

function formatDay(dateISO: string) {
  return new Intl.DateTimeFormat('es-CR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${dateISO}T00:00:00`))
}

// La vía por bloque permite conservar el pago de las horas trabajadas cuando
// el permiso es sin goce. Los tipos intradía se miden en horas dentro del turno.
export function JustifyAbsenceModal({
  employmentHistoryId,
  employeeName,
  dateISO,
  block,
  onClose,
}: JustifyAbsenceModalProps) {
  const [tipos, setTipos] = useState<AusenciaTypeRow[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tipoId, setTipoId] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [boleta, setBoleta] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const guard = useUnsavedChanges({
    label: 'la justificación de ausencia',
    value: { tipoId, observaciones, boleta },
    busy: isSaving,
  })

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
  const title = block ? 'Justificar 2.º bloque' : 'Justificar ausencia'

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setFieldError(null)
    setServerError(null)

    if (!selected) {
      setFieldError('Selecciona el tipo de ausencia.')
      return
    }

    setIsSaving(true)
    const result = block
      ? await justifySecondBlock({
          employmentHistoryId,
          tipoAusenciaId: selected.tau_id,
          date: dateISO,
          motivo: observaciones || undefined,
        })
      : await createAusencia({
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

    toast.success(block ? '2.º bloque justificado.' : 'Ausencia justificada.')
    guard.acceptChanges()
    onClose()
  }

  return (
    <Modal title={title} subtitle={`${employeeName} — ${formatDay(dateISO)}`} onClose={onClose}>
      <form
        ref={(element) => guard.bindRoot(element)}
        onSubmit={handleSubmit}
        className="space-y-3"
        noValidate
      >
        {(serverError || loadError) && (
          <Alert>
            <div>{serverError ?? loadError}</div>
          </Alert>
        )}

        <p className="text-sm text-slate-600">
          {block
            ? 'Sin goce: se paga lo trabajado en el 1.er bloque. Con goce: se paga el día completo.'
            : 'Registra el motivo por el que no vino. El día deja de contar como ausencia y queda registrado en Horarios y en la nómina como cualquier otra ausencia.'}
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

        {!block && selected?.tau_requiere_documento_ccss && (
          <div>
            <label className={LABEL} htmlFor="ausencia-boleta">
              Número de boleta CCSS
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
            placeholder="Ej. aviso por teléfono, trae el comprobante el lunes."
            className={INPUT}
          />
        </div>

        <Button type="submit" disabled={isSaving || !tipos} size="lg" block>
          {isSaving ? (
            <>
              <Loader2 className={SPINNER} /> Guardando
            </>
          ) : (
            title
          )}
        </Button>
      </form>
    </Modal>
  )
}
