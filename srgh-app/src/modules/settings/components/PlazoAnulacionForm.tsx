'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { CARD, INPUT, LABEL, SPINNER } from '@/components/ui/styles'
import {
  HORAS_ANULAR_PAGO_MAX,
  HORAS_ANULAR_PAGO_MIN,
} from '@/modules/payroll/lib/anulacionPagosReglas'
import { updateHorasAnularPago } from '@/modules/settings/actions/updateHorasAnularPago'

interface PlazoAnulacionFormProps {
  horasActuales: number
}

/**
 * Configuración → General: cuántas horas hay para anular un pago de
 * aguinaldo o liquidación hecho por error. Pasado ese plazo, el botón Anular
 * desaparece y la base rechaza la anulación.
 */
export function PlazoAnulacionForm({ horasActuales }: PlazoAnulacionFormProps) {
  const router = useRouter()
  const [valor, setValor] = useState(String(horasActuales))
  const [saving, setSaving] = useState(false)

  const horas = Number(valor)
  const valido =
    valor.trim() !== '' &&
    Number.isInteger(horas) &&
    horas >= HORAS_ANULAR_PAGO_MIN &&
    horas <= HORAS_ANULAR_PAGO_MAX
  const sinCambios = valido && horas === horasActuales

  async function guardar() {
    if (!valido) return
    setSaving(true)
    const result = await updateHorasAnularPago(horas)
    setSaving(false)

    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success('Plazo para anular pagos actualizado.')
    router.refresh()
  }

  return (
    <div className={`${CARD} max-w-xl p-5`}>
      <h2 className="text-sm font-bold text-slate-900">Anular pagos de aguinaldo y liquidación</h2>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        Si un aguinaldo o una liquidación se pagó por error, se puede anular durante este plazo
        desde que se registró el pago, con un motivo. El pago queda en el historial como anulado y
        se puede volver a pagar con un comprobante nuevo. Pasado el plazo ya no se puede anular.
      </p>

      <div className="mt-4 max-w-[12rem]">
        <label className={LABEL} htmlFor="horas-anular-pago">
          Horas para anular
        </label>
        <input
          id="horas-anular-pago"
          type="number"
          inputMode="numeric"
          min={HORAS_ANULAR_PAGO_MIN}
          max={HORAS_ANULAR_PAGO_MAX}
          step={1}
          value={valor}
          disabled={saving}
          aria-invalid={!valido}
          onChange={(e) => setValor(e.target.value)}
          className={`${INPUT} tabular-nums`}
        />
        <p className="mt-1 text-[11px] text-slate-500">
          Entre {HORAS_ANULAR_PAGO_MIN} y {HORAS_ANULAR_PAGO_MAX} horas (30 días). Por defecto, 48.
        </p>
        {!valido && (
          <p className="mt-1 text-[11px] font-medium text-rose-600">
            Tiene que ser un número entero entre {HORAS_ANULAR_PAGO_MIN} y {HORAS_ANULAR_PAGO_MAX}.
          </p>
        )}
      </div>

      <div className="mt-5 flex justify-end border-t border-slate-100 pt-4">
        <Button onClick={guardar} disabled={saving || !valido || sinCambios} size="md">
          {saving && <Loader2 className={SPINNER} />}
          Guardar cambios
        </Button>
      </div>
    </div>
  )
}
