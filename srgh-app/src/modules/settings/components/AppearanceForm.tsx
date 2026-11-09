'use client'

import { useUnsavedChanges } from '@/hooks/useUnsavedChanges'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { LABEL, SPINNER } from '@/components/ui/styles'
import {
  normalizarHex,
  type AparienciaInput,
  type AparienciaResult,
} from '@/modules/settings/lib/apariencia'
import { suggestAccent } from '@/lib/utils/color'
import { isNextNavigation } from '@/lib/utils/isNextNavigation'
import { ThemePreview } from './ThemePreview'

const ACCENT_PRESETS = ['#0891b2', '#1e40af', '#166534', '#9f1239', '#5b21b6', '#334155']
const SIDEBAR_PRESETS = ['#eef1f4', '#42454a', '#1b2a41', '#f1efe8', '#15181d', '#ececef']

interface ColorFieldProps {
  id: string
  label: string
  ayuda: string
  valor: string
  /** Color que se usa si no se personaliza. */
  heredado: string
  hereda: boolean
  heredarLabel: string
  presets: string[]
  onChange: (valor: string) => void
  onHeredaChange: (hereda: boolean) => void
  children?: React.ReactNode
}

function ColorField({
  id,
  label,
  ayuda,
  valor,
  heredado,
  hereda,
  heredarLabel,
  presets,
  onChange,
  onHeredaChange,
  children,
}: ColorFieldProps) {
  const normalizado = normalizarHex(valor)
  const invalido = !hereda && normalizado === null
  const errorId = `${id}-error`

  return (
    <div>
      <label className={LABEL} htmlFor={id}>
        {label}
      </label>
      <p className="mb-2 text-[11px] text-slate-500">{ayuda}</p>

      <div className="flex items-center gap-2.5">
        <input
          type="color"
          aria-label={`Elegir ${label.toLocaleLowerCase()}`}
          value={hereda ? heredado : (normalizado ?? heredado)}
          disabled={hereda}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-14 shrink-0 cursor-pointer rounded-lg border border-slate-200 bg-white p-1 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <input
          id={id}
          type="text"
          value={hereda ? heredado : valor}
          disabled={hereda}
          aria-invalid={invalido}
          aria-describedby={invalido ? errorId : undefined}
          onChange={(event) => onChange(event.target.value)}
          placeholder={heredado}
          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-800 outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-600/10 disabled:bg-slate-50 disabled:text-slate-500 aria-invalid:border-rose-400"
        />
      </div>
      {invalido && (
        <p id={errorId} className="mt-1 text-xs text-rose-700">
          Escribí un color como #0891B2.
        </p>
      )}

      <label className="mt-2 flex min-h-8 items-center gap-2 text-xs font-medium text-slate-700 pointer-coarse:min-h-11">
        <input
          type="checkbox"
          checked={hereda}
          onChange={(event) => onHeredaChange(event.target.checked)}
        />
        {heredarLabel}
      </label>

      <div className="mt-2 flex flex-wrap gap-2">
        {presets.map((preset) => {
          const elegido = !hereda && normalizado === preset
          return (
            <button
              key={preset}
              type="button"
              aria-label={`Usar ${preset}`}
              aria-pressed={elegido}
              disabled={hereda}
              onClick={() => onChange(preset)}
              style={{ backgroundColor: preset }}
              className={`flex h-8 w-8 items-center justify-center rounded-lg border border-black/10 outline-none transition focus-visible:ring-2 focus-visible:ring-brand-500/60 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 pointer-coarse:h-11 pointer-coarse:w-11 ${
                elegido ? 'ring-2 ring-slate-900 ring-offset-1' : ''
              }`}
            >
              {elegido && (
                <span className="rounded-full bg-white p-0.5 text-slate-900">
                  <Check className="h-3 w-3" aria-hidden="true" />
                </span>
              )}
            </button>
          )
        })}
      </div>
      {children}
    </div>
  )
}

interface AppearanceFormProps {
  /** Qué alcanza este tema y de dónde sale lo que no se personalice. */
  descripcion: string
  /** Para el aviso de cambios sin guardar: "la apariencia de la marca". */
  unsavedLabel: string
  colorAcentoActual: string | null
  colorSidebarActual: string | null
  /** Colores que se usan cuando el guardado es null: los de la empresa o los del sistema. */
  heredados: { acento: string; sidebar: string }
  /** Texto de la opción de heredar: "Usar el de la empresa". */
  heredarLabel: string
  previewNombre: string
  previewLogoUrl: string | null
  /** Guarda los colores (null = heredar). Lo provee cada pantalla. */
  onSave: (input: AparienciaInput) => Promise<AparienciaResult>
  onSaved?: () => void
  onCancel?: () => void
  /** Acción opcional en el aviso de guardado. */
  savedAction?: { label: string; onClick: () => void }
}

/**
 * Colores de la app con una vista previa propia. Es el mismo formulario para
 * una marca (en un modal) y para el tema de la empresa (en su pestaña): cada
 * color se puede personalizar o heredar por separado, y heredar se guarda como
 * null para que siga los cambios futuros de quien lo provee.
 */
export function AppearanceForm({
  descripcion,
  unsavedLabel,
  colorAcentoActual,
  colorSidebarActual,
  heredados,
  heredarLabel,
  previewNombre,
  previewLogoUrl,
  onSave,
  onSaved,
  onCancel,
  savedAction,
}: AppearanceFormProps) {
  const router = useRouter()
  const [acento, setAcento] = useState(colorAcentoActual ?? heredados.acento)
  const [sidebar, setSidebar] = useState(colorSidebarActual ?? heredados.sidebar)
  const [heredaAcento, setHeredaAcento] = useState(colorAcentoActual === null)
  const [heredaSidebar, setHeredaSidebar] = useState(colorSidebarActual === null)
  const [saving, setSaving] = useState(false)

  const guard = useUnsavedChanges({
    label: unsavedLabel,
    value: { acento, sidebar, heredaAcento, heredaSidebar },
    busy: saving,
  })

  const acentoValido = normalizarHex(acento)
  const sidebarValido = normalizarHex(sidebar)
  const acentoEfectivo = heredaAcento ? heredados.acento : (acentoValido ?? heredados.acento)
  const sidebarEfectivo = heredaSidebar ? heredados.sidebar : (sidebarValido ?? heredados.sidebar)
  const puedeGuardar = (heredaAcento || acentoValido) && (heredaSidebar || sidebarValido)

  // Se recalcula con cada cambio de la barra: la sugerencia siempre contrasta
  // contra el fondo que se está viendo, aunque todavía no se haya guardado.
  const sugerencia = useMemo(() => suggestAccent(sidebarEfectivo), [sidebarEfectivo])
  const sugerenciaAplicada = sugerencia.toLowerCase() === acentoValido

  async function guardar() {
    const nuevoAcento = heredaAcento ? null : acentoValido
    const nuevoSidebar = heredaSidebar ? null : sidebarValido
    setSaving(true)
    let result: AparienciaResult
    try {
      result = await onSave({ colorAcento: nuevoAcento, colorSidebar: nuevoSidebar })
    } catch (error) {
      if (!isNextNavigation(error)) {
        toast.error(
          'No se pudo confirmar el guardado. Revisá la conexión y reintentá; tus colores siguen en el formulario.'
        )
      }
      return
    } finally {
      // Con `saving` en true, el aviso de cambios no deja salir: si no se libera
      // en todos los caminos, el modal queda trabado hasta recargar.
      setSaving(false)
    }

    if (!result.ok) {
      toast.error(result.error)
      return
    }

    // Lo que quedó guardado es la versión normalizada ("0891B2" → "#0891b2").
    const guardado = {
      acento: nuevoAcento ?? acento,
      sidebar: nuevoSidebar ?? sidebar,
      heredaAcento,
      heredaSidebar,
    }
    setAcento(guardado.acento)
    setSidebar(guardado.sidebar)
    guard.acceptChanges(guardado)
    toast.success(
      'Apariencia actualizada.',
      savedAction ? { action: savedAction, duration: 8000 } : undefined
    )
    router.refresh()
    onSaved?.()
  }

  return (
    <div ref={(element) => guard.bindRoot(element)} className="@container">
      <div className="grid gap-5 @2xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="@2xl:order-2">
          <p className={LABEL}>Vista previa</p>
          <ThemePreview
            acento={acentoEfectivo}
            sidebar={sidebarEfectivo}
            nombre={previewNombre}
            logoUrl={previewLogoUrl}
          />
          <p className="mt-2 text-[11px] text-slate-500">La app no cambia mientras elegís.</p>
        </div>

        <div className="min-w-0 space-y-5">
          <p className="text-xs leading-relaxed text-slate-500">{descripcion}</p>

          <ColorField
            id="color-acento"
            label="Color de acento"
            ayuda="Botones, ítem activo del menú, enlaces y avatar."
            valor={acento}
            heredado={heredados.acento}
            hereda={heredaAcento}
            heredarLabel={heredarLabel}
            presets={ACCENT_PRESETS}
            onChange={setAcento}
            onHeredaChange={setHeredaAcento}
          >
            {!heredaAcento && (
              <button
                type="button"
                onClick={() => setAcento(sugerencia)}
                disabled={sugerenciaAplicada}
                className="mt-2 flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-2.5 py-1.5 text-[11px] font-medium text-slate-600 transition hover:border-brand-400 hover:text-brand-700 disabled:cursor-default disabled:border-brand-300 disabled:text-brand-700"
              >
                <Sparkles className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span
                  className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/10"
                  style={{ backgroundColor: sugerencia }}
                  aria-hidden="true"
                />
                {sugerenciaAplicada
                  ? 'Sugerido para contrastar con tu barra — aplicado'
                  : 'Usar sugerido: contrasta con tu barra lateral'}
              </button>
            )}
          </ColorField>

          <ColorField
            id="color-sidebar"
            label="Color de la barra lateral"
            ayuda="Fondo del menú y un tono suave para el fondo de las pantallas."
            valor={sidebar}
            heredado={heredados.sidebar}
            hereda={heredaSidebar}
            heredarLabel={heredarLabel}
            presets={SIDEBAR_PRESETS}
            onChange={setSidebar}
            onHeredaChange={setHeredaSidebar}
          />

          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
            {onCancel && (
              <Button
                type="button"
                variant="secondary"
                size="md"
                disabled={saving}
                onClick={() => guard.confirmLeave(onCancel)}
              >
                Cancelar
              </Button>
            )}
            <Button onClick={guardar} disabled={saving || !puedeGuardar} size="md">
              {saving && <Loader2 className={SPINNER} />}
              Guardar cambios
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
