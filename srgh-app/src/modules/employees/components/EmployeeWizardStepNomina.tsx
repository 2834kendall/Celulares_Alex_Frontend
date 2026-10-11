'use client'

import type { CatalogoItem } from '@/modules/employees/types'
import { BankingFields } from './EmployeeFields'
import { ContractFields } from './ContractFields'

interface EmployeeWizardStepNominaProps {
  puestos: CatalogoItem[]
  sucursales: CatalogoItem[]
  tiposContrato: CatalogoItem[]
  tiposJornada: CatalogoItem[]
  bancos: CatalogoItem[]
}

/** Paso 2 del onboarding: contrato (historial laboral) + datos bancarios/CCSS. */
export function EmployeeWizardStepNomina({
  puestos,
  sucursales,
  tiposContrato,
  tiposJornada,
  bancos,
}: EmployeeWizardStepNominaProps) {
  return (
    <div className="@container space-y-4">
      <section className="space-y-3">
        <p className="text-xs text-slate-500">
          Condiciones de la contratación. Estos datos crean el contrato vigente del colaborador.
        </p>
        {/* El inicio del contrato llega precargado con el ingreso a la empresa
            (ver goNext en EmployeeWizard): en un alta nueva siempre coinciden. */}
        <ContractFields
          basePath="contratacion."
          puestos={puestos}
          sucursales={sucursales}
          tiposContrato={tiposContrato}
          tiposJornada={tiposJornada}
        />
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">Datos de pago</h3>
        <BankingFields basePath="datos_pago." bancos={bancos} />
      </section>
    </div>
  )
}
