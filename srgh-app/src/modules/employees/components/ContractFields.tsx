'use client'

import { useFormContext } from 'react-hook-form'
import type { CatalogoItem } from '@/modules/employees/types'
import { CatalogSelect, CurrencyInput, DateInput, getFieldError, Labeled } from './EmployeeFields'

export interface ContractCatalogs {
  puestos: CatalogoItem[]
  sucursales: CatalogoItem[]
  tiposContrato: CatalogoItem[]
  tiposJornada: CatalogoItem[]
}

interface ContractFieldsProps extends ContractCatalogs {
  /** Prefijo de los campos: 'contratacion.' en el wizard, '' en el perfil. */
  basePath?: string
  /**
   * false al editar un contrato: la sucursal no se cambia en sitio (sería un
   * traslado que reescribe la historia), así que ni se muestra el campo.
   */
  mostrarSucursal?: boolean
}

/**
 * Condiciones de un contrato (sgrh_historial_laboral). Una sola definición
 * para el alta del wizard, el nuevo contrato y la edición desde el perfil.
 * Usa el FormProvider del formulario que la contiene.
 */
export function ContractFields({
  basePath = '',
  mostrarSucursal = true,
  puestos,
  sucursales,
  tiposContrato,
  tiposJornada,
}: ContractFieldsProps) {
  const {
    formState: { errors },
  } = useFormContext()
  const path = (campo: string) => `${basePath}${campo}`

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <CatalogSelect name={path('lab_puesto_id')} label="Puesto *" options={puestos} />
      {mostrarSucursal && (
        <CatalogSelect name={path('lab_sucursal_id')} label="Sucursal *" options={sucursales} />
      )}
      <CatalogSelect
        name={path('lab_tipo_contrato_id')}
        label="Tipo de contrato *"
        options={tiposContrato}
      />
      <CatalogSelect
        name={path('lab_tipo_jornada_id')}
        label="Tipo de jornada *"
        options={tiposJornada}
      />

      <Labeled
        label="Inicio del contrato *"
        error={getFieldError(errors, path('lab_fecha_inicio'))}
      >
        <DateInput
          name={path('lab_fecha_inicio')}
          label="Inicio del contrato"
          invalid={Boolean(getFieldError(errors, path('lab_fecha_inicio')))}
        />
      </Labeled>

      <Labeled label="Salario base (₡) *" error={getFieldError(errors, path('lab_salario_base'))}>
        <CurrencyInput
          name={path('lab_salario_base')}
          invalid={Boolean(getFieldError(errors, path('lab_salario_base')))}
        />
      </Labeled>

      <Labeled label="Salario real (₡) *" error={getFieldError(errors, path('lab_salario_real'))}>
        <CurrencyInput
          name={path('lab_salario_real')}
          invalid={Boolean(getFieldError(errors, path('lab_salario_real')))}
        />
      </Labeled>
    </div>
  )
}
