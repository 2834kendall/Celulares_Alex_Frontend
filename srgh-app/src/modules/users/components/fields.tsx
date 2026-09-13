'use client'

import { useController, type Control, type FieldValues, type Path } from 'react-hook-form'
import type { CatalogoItem } from '@/modules/employees/types'

// Helpers de formulario del módulo de usuarios (mismo look & feel que los
// formularios de empleados, sin importar componentes de ese módulo para no
// acoplar los dominios).

export const INPUT_CLASSES =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-600/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 aria-[invalid=true]:border-rose-400 aria-[invalid=true]:focus:ring-rose-400/20'

export const LABEL_CLASSES =
  'mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500'

// setValueAs para selects numéricos opcionales. OJO: react-hook-form también
// lo aplica sobre el defaultValue (null), y Number(null) === 0 rompería la
// validación positive(); por eso null/undefined se preservan como null.
export function toOptionalNumber(value: unknown): number | null {
  return value === '' || value == null ? null : Number(value)
}

interface LabeledProps {
  label: string
  error?: string
  children: React.ReactNode
}

export function Labeled({ label, error, children }: LabeledProps) {
  return (
    <div>
      {/* El error vive fuera del <label> para no contaminar el nombre accesible. */}
      <label className="block">
        <span className={LABEL_CLASSES}>{label}</span>
        {children}
      </label>
      {error && <p className="mt-1 text-xs font-medium text-rose-600">{error}</p>}
    </div>
  )
}

const CHECKBOX_CLASSES =
  'h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600 disabled:cursor-not-allowed disabled:opacity-50'

interface SucursalesFieldProps<T extends FieldValues> {
  control: Control<T>
  name: Path<T>
  sucursales: CatalogoItem[]
  error?: string
}

/**
 * Selector múltiple de sucursales: un usuario puede estar a cargo de más de
 * una (gerente/supervisor regional). Vacío = "todas las sucursales" (nivel
 * empresa) — se rinde como una opción aparte porque desmarcar todo no es lo
 * mismo que "ninguna sucursal": es la AUSENCIA de restricción, incluidas las
 * sucursales que se creen después.
 *
 * Un <fieldset>/<legend> en vez de <Labeled> (que envuelve todo en un solo
 * <label>): con varios checkboxes cada uno necesita su propia etiqueta.
 */
export function SucursalesField<T extends FieldValues>({
  control,
  name,
  sucursales,
  error,
}: SucursalesFieldProps<T>) {
  const {
    field: { value, onChange },
  } = useController({ name, control })

  const seleccionadas: number[] = Array.isArray(value) ? value : []
  const todas = seleccionadas.length === 0

  function alternar(id: number) {
    onChange(
      seleccionadas.includes(id) ? seleccionadas.filter((v) => v !== id) : [...seleccionadas, id]
    )
  }

  return (
    <fieldset>
      <legend className={LABEL_CLASSES}>Sucursales</legend>
      <div className="space-y-1.5 rounded-xl border border-slate-200 bg-white p-2.5">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={todas}
            onChange={() => onChange([])}
            className={CHECKBOX_CLASSES}
          />
          Todas las sucursales
        </label>
        {sucursales.length > 0 && (
          <div className="ml-1 space-y-1 border-l border-slate-100 pl-3">
            {sucursales.map((sucursal) => (
              <label key={sucursal.id} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={seleccionadas.includes(sucursal.id)}
                  onChange={() => alternar(sucursal.id)}
                  className={CHECKBOX_CLASSES}
                />
                {sucursal.nombre}
              </label>
            ))}
          </div>
        )}
      </div>
      {error && <p className="mt-1 text-xs font-medium text-rose-600">{error}</p>}
    </fieldset>
  )
}
