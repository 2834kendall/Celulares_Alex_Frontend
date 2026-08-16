'use client'

import { useFormContext } from 'react-hook-form'
import type { CatalogoItem } from '@/modules/employees/types'
import {
  BankingFields,
  CatalogSelect,
  CurrencyInput,
  DateInput,
  getFieldError,
  Labeled,
} from './EmployeeFields'

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
  const {
    formState: { errors },
  } = useFormContext()

  return (
    <div className="@container space-y-4">
      <section className="space-y-3">
        <p className="text-xs text-slate-500">
          Condiciones de la contratación. Estos datos crean el contrato vigente del colaborador.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <CatalogSelect name="contratacion.lab_puesto_id" label="Puesto *" options={puestos} />
          <CatalogSelect
            name="contratacion.lab_sucursal_id"
            label="Sucursal *"
            options={sucursales}
          />
          <CatalogSelect
            name="contratacion.lab_tipo_contrato_id"
            label="Tipo de contrato *"
            options={tiposContrato}
          />
          <CatalogSelect
            name="contratacion.lab_tipo_jornada_id"
            label="Tipo de jornada *"
            options={tiposJornada}
          />

          <Labeled
            label="Fecha de inicio *"
            error={getFieldError(errors, 'contratacion.lab_fecha_inicio')}
          >
            <DateInput
              name="contratacion.lab_fecha_inicio"
              label="Fecha de inicio"
              invalid={Boolean(getFieldError(errors, 'contratacion.lab_fecha_inicio'))}
            />
          </Labeled>

          <Labeled
            label="Salario base (₡) *"
            error={getFieldError(errors, 'contratacion.lab_salario_base')}
          >
            <CurrencyInput
              name="contratacion.lab_salario_base"
              invalid={Boolean(getFieldError(errors, 'contratacion.lab_salario_base'))}
            />
          </Labeled>

          <Labeled
            label="Salario real (₡) *"
            error={getFieldError(errors, 'contratacion.lab_salario_real')}
          >
            <CurrencyInput
              name="contratacion.lab_salario_real"
              invalid={Boolean(getFieldError(errors, 'contratacion.lab_salario_real'))}
            />
          </Labeled>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">Datos de pago</h3>
        <BankingFields basePath="datos_pago." bancos={bancos} />
      </section>
    </div>
  )
}
