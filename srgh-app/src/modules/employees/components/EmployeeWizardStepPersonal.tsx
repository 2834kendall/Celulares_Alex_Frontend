'use client'

import type { CatalogoItem, TerritorioCatalogo } from '@/modules/employees/types'
import { AddressFields, PersonalDataFields } from './EmployeeFields'

interface EmployeeWizardStepPersonalProps {
  tiposIdentificacion: CatalogoItem[]
  territorio: TerritorioCatalogo
}

/**
 * Paso 1 del onboarding: datos personales y de contacto (paths `empleado.*`)
 * más la dirección (paths `direccion.*`).
 *
 * La dirección va aquí y no en un paso propio porque es dato personal, igual
 * que el teléfono. Datos de pago tiene paso propio por pertenecer al dominio de
 * nómina, no por vivir en otra tabla.
 */
export function EmployeeWizardStepPersonal({
  tiposIdentificacion,
  territorio,
}: EmployeeWizardStepPersonalProps) {
  return (
    <div className="space-y-4">
      <section className="space-y-3">
        <p className="text-xs text-slate-500">
          Información personal del colaborador y contactos de emergencia.
        </p>
        <PersonalDataFields basePath="empleado." tiposIdentificacion={tiposIdentificacion} />
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">Dirección</h3>
        <AddressFields basePath="direccion." territorio={territorio} />
      </section>
    </div>
  )
}
