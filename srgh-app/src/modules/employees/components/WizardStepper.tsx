'use client'

import { Check } from 'lucide-react'

export interface WizardStep {
  id: string
  label: string
}

interface WizardStepperProps {
  steps: WizardStep[]
  currentIndex: number
}

/**
 * Indicador de progreso del wizard: pasos numerados, hecho / actual / pendiente.
 *
 * Dos presentaciones. En angosto, los cuatro pasos con su etiqueta se
 * partian en tres renglones desordenados —"1 Informacion principal" solo,
 * despues "2 Datos de nomina  3 Documentos", despues "4 Revision"— y el
 * usuario no distinguia en cual estaba. Ahi se muestra solo el paso actual
 * con una barra de avance, que es la informacion que de verdad importa:
 * donde estoy y cuanto falta.
 *
 * Desde @md aparece la fila completa, igual que en escritorio.
 */
export function WizardStepper({ steps, currentIndex }: WizardStepperProps) {
  const actual = steps[currentIndex]
  const progreso = ((currentIndex + 1) / steps.length) * 100

  return (
    <div className="@container">
      {/* Angosto: paso actual + barra de avance */}
      <div className="@md:hidden">
        <div className="flex items-baseline justify-between gap-3">
          <p className="min-w-0 text-sm font-bold text-slate-900">{actual?.label}</p>
          <p className="shrink-0 text-[11px] font-semibold tabular-nums text-slate-500">
            Paso {currentIndex + 1} de {steps.length}
          </p>
        </div>
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
          aria-valuenow={currentIndex + 1}
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-label={`Paso ${currentIndex + 1} de ${steps.length}: ${actual?.label ?? ''}`}
        >
          {/* La transicion es lo que convierte el salto de paso en avance */}
          <div
            className="h-full rounded-full bg-blue-600 transition-[width] duration-300 ease-out motion-reduce:transition-none"
            style={{ width: `${progreso}%` }}
          />
        </div>
      </div>

      {/* Ancho: la fila completa de pasos */}
      <ol className="hidden flex-wrap items-center gap-1.5 @md:flex">
        {steps.map((step, index) => {
          const isDone = index < currentIndex
          const isCurrent = index === currentIndex

          return (
            <li
              key={step.id}
              aria-current={isCurrent ? 'step' : undefined}
              className="flex items-center gap-1.5"
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition ${
                  isDone
                    ? 'bg-emerald-100 text-emerald-700'
                    : isCurrent
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-400'
                }`}
              >
                {isDone ? <Check className="h-3.5 w-3.5" /> : index + 1}
              </span>
              <span
                className={`text-xs font-semibold transition-colors ${
                  isCurrent ? 'text-slate-900' : isDone ? 'text-emerald-700' : 'text-slate-400'
                }`}
              >
                {step.label}
              </span>
              {index < steps.length - 1 && (
                <span
                  aria-hidden
                  className={`mx-1 h-px w-6 transition-colors @2xl:w-10 ${
                    isDone ? 'bg-emerald-200' : 'bg-slate-200'
                  }`}
                />
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
