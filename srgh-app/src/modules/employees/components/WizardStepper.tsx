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

/** Indicador de progreso del wizard: pasos numerados, hecho / actual / pendiente. */
export function WizardStepper({ steps, currentIndex }: WizardStepperProps) {
  return (
    <ol className="flex flex-wrap items-center gap-1.5">
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
              className={`text-xs font-semibold ${
                isCurrent ? 'text-slate-900' : isDone ? 'text-emerald-700' : 'text-slate-400'
              }`}
            >
              {step.label}
            </span>
            {index < steps.length - 1 && (
              <span aria-hidden className="mx-1 h-px w-6 bg-slate-200 sm:w-10" />
            )}
          </li>
        )
      })}
    </ol>
  )
}
