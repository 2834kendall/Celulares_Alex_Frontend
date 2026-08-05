'use client'

import { PhotoDropzone } from '@/components/ui/PhotoDropzone'
import type { CatalogoItem, TerritorioCatalogo } from '@/modules/employees/types'
import { AddressFields, PersonalDataFields } from './EmployeeFields'

interface EmployeeWizardStepPersonalProps {
  tiposIdentificacion: CatalogoItem[]
  territorio: TerritorioCatalogo
  foto: File | null
  onFotoChange: (file: File | null) => void
}

/**
 * Paso 1 del onboarding: foto (opcional), datos personales y de contacto
 * (paths `empleado.*`) más la dirección (paths `direccion.*`).
 *
 * La foto vive FUERA de react-hook-form/Zod a propósito: un File no viaja
 * por el schema del onboarding ni por createEmployee (que espera el emp_id
 * ya creado — ver setEmployeePhoto). El wizard la sube después, en onSubmit.
 *
 * La dirección va aquí y no en un paso propio porque es dato personal, igual
 * que el teléfono. Datos de pago tiene paso propio por pertenecer al dominio de
 * nómina, no por vivir en otra tabla.
 */
export function EmployeeWizardStepPersonal({
  tiposIdentificacion,
  territorio,
  foto,
  onFotoChange,
}: EmployeeWizardStepPersonalProps) {
  return (
    <div className="space-y-4">
      <section className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">
          Foto del colaborador (opcional)
        </h3>
        <PhotoDropzone file={foto} onSelect={onFotoChange} onClear={() => onFotoChange(null)} />
      </section>

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
