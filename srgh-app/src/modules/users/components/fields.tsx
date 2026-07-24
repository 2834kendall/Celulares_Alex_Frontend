'use client'

// Helpers de formulario del módulo de usuarios (mismo look & feel que los
// formularios de empleados, sin importar componentes de ese módulo para no
// acoplar los dominios).

export const INPUT_CLASSES =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-600/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 aria-[invalid=true]:border-rose-400 aria-[invalid=true]:focus:ring-rose-400/20'

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
