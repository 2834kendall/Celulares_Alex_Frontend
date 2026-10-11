'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { CARD, SPINNER } from '@/components/ui/styles'
import { cn } from '@/lib/utils/cn'
import { formatHora, formatRangoHora, type FormatoHora } from '@/lib/time/formatoHora'
import { updateFormatoHora } from '@/modules/settings/actions/updateFormatoHora'

interface FormatoHoraFormProps {
  formatoActual: FormatoHora
}

// Horas de ejemplo que cubren los casos que confunden: mañana, tarde y
// mediodía/medianoche.
const EJEMPLO_TURNO = ['08:00', '17:30'] as const
const EJEMPLO_MARCA = '13:05'

const OPCIONES: { value: FormatoHora; titulo: string; detalle: string }[] = [
  {
    value: '24h',
    titulo: '24 horas',
    detalle: 'De 00:00 a 23:59. Sin a. m. ni p. m.',
  },
  {
    value: '12h',
    titulo: '12 horas',
    detalle: 'De 1:00 a 12:59, con a. m. o p. m.',
  },
]

/**
 * Configuración → General: formato 12/24h de toda la empresa.
 *
 * Solo cambia cómo se VEN y se ELIGEN las horas (marcas, horarios,
 * kiosco, selectores de hora). Lo que se guarda y se calcula sigue en 24h,
 * así que cambiarlo no altera tardías, planilla ni ningún dato.
 */
export function FormatoHoraForm({ formatoActual }: FormatoHoraFormProps) {
  const router = useRouter()
  const [formato, setFormato] = useState<FormatoHora>(formatoActual)
  const [saving, setSaving] = useState(false)

  const sinCambios = formato === formatoActual

  async function guardar() {
    setSaving(true)
    const result = await updateFormatoHora(formato)
    setSaving(false)

    if (!result.ok) {
      toast.error(result.error)
      return
    }

    toast.success('Formato de hora actualizado.')
    router.refresh()
  }

  return (
    <div className={`${CARD} max-w-xl p-5`}>
      <h2 className="text-sm font-bold text-slate-900">Formato de hora</h2>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        Cómo se muestran y se eligen las horas en todo el sistema: marcas de asistencia, horarios,
        reloj del kiosco y los selectores de hora. Aplica a todas las sucursales. Solo cambia la
        forma de verlas — los registros, tardías y planilla no se modifican.
      </p>

      <div
        role="radiogroup"
        aria-label="Formato de hora"
        className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2"
      >
        {OPCIONES.map((opcion) => {
          const activo = formato === opcion.value
          return (
            <button
              key={opcion.value}
              type="button"
              role="radio"
              aria-checked={activo}
              onClick={() => setFormato(opcion.value)}
              disabled={saving}
              className={cn(
                'flex flex-col gap-2.5 rounded-xl border p-3.5 text-left outline-none transition focus-visible:ring-4 focus-visible:ring-brand-600/15 disabled:cursor-not-allowed',
                activo
                  ? 'border-brand-600 bg-brand-50/60 ring-1 ring-brand-600'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              )}
            >
              <span className="flex items-start justify-between gap-2">
                <span>
                  <span className="block text-sm font-bold text-slate-900">{opcion.titulo}</span>
                  <span className="mt-0.5 block text-[11px] text-slate-500">{opcion.detalle}</span>
                </span>
                <span
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                    activo ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300'
                  )}
                  aria-hidden="true"
                >
                  {activo && <Check className="h-3 w-3" />}
                </span>
              </span>

              <span className="space-y-1 rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] text-slate-500">
                <span className="flex items-baseline justify-between gap-2">
                  <span>Turno</span>
                  <span className="font-semibold tabular-nums text-slate-800">
                    {formatRangoHora(EJEMPLO_TURNO[0], EJEMPLO_TURNO[1], opcion.value)}
                  </span>
                </span>
                <span className="flex items-baseline justify-between gap-2">
                  <span>Marca</span>
                  <span className="font-semibold tabular-nums text-slate-800">
                    {formatHora(EJEMPLO_MARCA, opcion.value)}
                  </span>
                </span>
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-5 flex justify-end border-t border-slate-100 pt-4">
        <Button onClick={guardar} disabled={saving || sinCambios} size="md">
          {saving && <Loader2 className={SPINNER} />}
          Guardar cambios
        </Button>
      </div>
    </div>
  )
}
