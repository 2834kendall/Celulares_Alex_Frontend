'use client'

import type { CatalogoItem } from '@/modules/employees/types'
import { PersonalDataFields } from './EmployeeFields'

interface EmployeeWizardStepPersonalProps {
  tiposIdentificacion: CatalogoItem[]
}

/** Paso 1 del onboarding: datos personales y de contacto (paths `empleado.*`). */
export function EmployeeWizardStepPersonal({
  tiposIdentificacion,
}: EmployeeWizardStepPersonalProps) {
  return (
    <section className="space-y-3">
      <p className="text-xs text-slate-500">
        Información personal del colaborador y contactos de emergencia.
      </p>
      <PersonalDataFields basePath="empleado." tiposIdentificacion={tiposIdentificacion} />
    </section>
  )
}
