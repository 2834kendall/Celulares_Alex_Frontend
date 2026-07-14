'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FormProvider, useForm, type Path, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, ArrowLeft, ArrowRight, Loader2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import {
  onboardingEmpleadoSchema,
  type CatalogoItem,
  type OnboardingEmpleadoInput,
} from '@/modules/employees/types'
import { createEmployee } from '@/modules/employees/actions/createEmployee'
import { formatCRC, formatDate, fullName } from '@/modules/employees/lib/format'
import { WizardStepper, type WizardStep } from './WizardStepper'
import { EmployeeWizardStepPersonal } from './EmployeeWizardStepPersonal'
import { EmployeeWizardStepNomina } from './EmployeeWizardStepNomina'
import { EmployeeWizardStepUsuario } from './EmployeeWizardStepUsuario'

const STEPS: WizardStep[] = [
  { id: 'personal', label: 'Información principal' },
  { id: 'nomina', label: 'Datos de nómina' },
  { id: 'usuario', label: 'Revisión y usuario' },
]

// Campos que valida el botón "Siguiente" de cada paso. El paso 3 se valida
// completo en el submit (sus campos solo existen si el toggle está activo).
const STEP_FIELDS: Path<OnboardingEmpleadoInput>[][] = [
  [
    'empleado.emp_nombre',
    'empleado.emp_apellido_1',
    'empleado.emp_apellido_2',
    'empleado.emp_tipo_identificacion_id',
    'empleado.emp_numero_identificacion',
    'empleado.emp_fecha_ingreso_original',
    'empleado.emp_fecha_nacimiento',
    'empleado.emp_genero',
    'empleado.emp_nacionalidad',
    'empleado.emp_telefono',
    'empleado.emp_email_personal',
    'empleado.emp_numero_asegurado_ccss',
    'empleado.emp_nombre_contacto_emergencia',
    'empleado.emp_telefono_emergencia',
  ],
  [
    'contratacion.lab_puesto_id',
    'contratacion.lab_sucursal_id',
    'contratacion.lab_tipo_contrato_id',
    'contratacion.lab_tipo_jornada_id',
    'contratacion.lab_fecha_inicio',
    'contratacion.lab_salario_base',
    'contratacion.lab_salario_real',
    'datos_pago.edp_banco',
    'datos_pago.edp_tipo_cuenta',
    'datos_pago.edp_numero_cuenta',
  ],
  [],
]

function nombreDe(items: CatalogoItem[], id: number | undefined) {
  return items.find((item) => item.id === id)?.nombre ?? '—'
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="truncate text-sm text-slate-800">{value}</dd>
    </div>
  )
}

interface OnboardingSummaryProps {
  values: OnboardingEmpleadoInput
  puestos: CatalogoItem[]
  sucursales: CatalogoItem[]
  tiposContrato: CatalogoItem[]
  tiposJornada: CatalogoItem[]
}

/** Resumen de lo capturado en los pasos 1 y 2, para revisar antes de crear. */
function OnboardingSummary({
  values,
  puestos,
  sucursales,
  tiposContrato,
  tiposJornada,
}: OnboardingSummaryProps) {
  const { empleado, contratacion } = values

  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-600">
        Revisa antes de crear
      </h3>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryItem
          label="Colaborador"
          value={fullName({
            emp_nombre: empleado.emp_nombre,
            emp_apellido_1: empleado.emp_apellido_1,
            emp_apellido_2: empleado.emp_apellido_2 ?? null,
          })}
        />
        <SummaryItem label="Identificación" value={empleado.emp_numero_identificacion} />
        <SummaryItem
          label="Fecha de ingreso"
          value={formatDate(empleado.emp_fecha_ingreso_original)}
        />
        <SummaryItem label="Puesto" value={nombreDe(puestos, contratacion.lab_puesto_id)} />
        <SummaryItem label="Sucursal" value={nombreDe(sucursales, contratacion.lab_sucursal_id)} />
        <SummaryItem
          label="Tipo de contrato"
          value={nombreDe(tiposContrato, contratacion.lab_tipo_contrato_id)}
        />
        <SummaryItem
          label="Jornada"
          value={nombreDe(tiposJornada, contratacion.lab_tipo_jornada_id)}
        />
        <SummaryItem label="Inicio de contrato" value={formatDate(contratacion.lab_fecha_inicio)} />
        <SummaryItem label="Salario base" value={formatCRC(contratacion.lab_salario_base)} />
        <SummaryItem label="Salario real" value={formatCRC(contratacion.lab_salario_real)} />
      </dl>
      <p className="mt-3 text-[11px] text-slate-500">
        Usa «Anterior» si necesitas corregir algo. El empleado se crea únicamente al presionar
        «Crear empleado».
      </p>
    </section>
  )
}

interface EmployeeWizardProps {
  tiposIdentificacion: CatalogoItem[]
  puestos: CatalogoItem[]
  sucursales: CatalogoItem[]
  tiposContrato: CatalogoItem[]
  tiposJornada: CatalogoItem[]
  roles: CatalogoItem[]
  canInviteUser: boolean
}

export function EmployeeWizard({
  tiposIdentificacion,
  puestos,
  sucursales,
  tiposContrato,
  tiposJornada,
  roles,
  canInviteUser,
}: EmployeeWizardProps) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [crearUsuario, setCrearUsuario] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const methods = useForm<OnboardingEmpleadoInput>({
    // z.preprocess vuelve `unknown` el lado input del schema; el formulario
    // trabaja con el tipo de salida (''→null ya resuelto por el resolver).
    resolver: zodResolver(onboardingEmpleadoSchema) as Resolver<OnboardingEmpleadoInput>,
    mode: 'onTouched',
    defaultValues: {
      empleado: {
        emp_nombre: '',
        emp_apellido_1: '',
        emp_apellido_2: '',
        emp_numero_identificacion: '',
        emp_fecha_ingreso_original: '',
        emp_fecha_nacimiento: '',
        emp_nacionalidad: 'Costarricense',
        emp_telefono: '',
        emp_email_personal: '',
        emp_numero_asegurado_ccss: '',
        emp_nombre_contacto_emergencia: '',
        emp_telefono_emergencia: '',
      },
      contratacion: {
        lab_fecha_inicio: '',
      },
      datos_pago: {
        edp_banco: '',
        edp_numero_cuenta: '',
      },
      usuario: undefined,
    },
  })

  const {
    handleSubmit,
    trigger,
    setValue,
    formState: { isSubmitting },
  } = methods

  function handleToggleUsuario(enabled: boolean) {
    setCrearUsuario(enabled)
    if (!enabled) {
      setValue('usuario', undefined)
    }
  }

  async function goNext() {
    const valid = await trigger(STEP_FIELDS[step])
    if (valid) {
      setStep((current) => Math.min(current + 1, STEPS.length - 1))
    }
  }

  function goBack() {
    setStep((current) => Math.max(current - 1, 0))
  }

  async function onSubmit(values: OnboardingEmpleadoInput) {
    setServerError(null)

    const result = await createEmployee(values)
    if (!result.ok) {
      setServerError(result.error)
      return
    }

    if (result.usuarioWarning) {
      toast.warning(result.usuarioWarning)
    }
    toast.success('Empleado creado correctamente.')
    router.push(`/employees/${result.empId}`)
  }

  const isLastStep = step === STEPS.length - 1

  return (
    <div className="space-y-4">
      <WizardStepper steps={STEPS} currentIndex={step} />

      <FormProvider {...methods}>
        <form
          // El form solo puede enviarse desde el último paso; en los anteriores
          // cualquier submit accidental (Enter, activación por defecto) se anula.
          onSubmit={isLastStep ? handleSubmit(onSubmit) : (e) => e.preventDefault()}
          noValidate
          onKeyDown={(e) => {
            // Enter no debe enviar el onboarding completo desde pasos intermedios.
            if (
              e.key === 'Enter' &&
              !isLastStep &&
              (e.target as HTMLElement).tagName !== 'BUTTON'
            ) {
              e.preventDefault()
            }
          }}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,.04)]"
        >
          {serverError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />
              <div>{serverError}</div>
            </div>
          )}

          {step === 0 && <EmployeeWizardStepPersonal tiposIdentificacion={tiposIdentificacion} />}
          {step === 1 && (
            <EmployeeWizardStepNomina
              puestos={puestos}
              sucursales={sucursales}
              tiposContrato={tiposContrato}
              tiposJornada={tiposJornada}
            />
          )}
          {step === 2 && (
            <div className="space-y-4">
              <OnboardingSummary
                values={methods.getValues()}
                puestos={puestos}
                sucursales={sucursales}
                tiposContrato={tiposContrato}
                tiposJornada={tiposJornada}
              />
              <EmployeeWizardStepUsuario
                roles={roles}
                sucursales={sucursales}
                canInviteUser={canInviteUser}
                crearUsuario={crearUsuario}
                onToggle={handleToggleUsuario}
              />
            </div>
          )}

          <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={goBack}
              disabled={step === 0 || isSubmitting}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm outline-none transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:opacity-40"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Anterior
            </button>

            {/* key distinto por botón: si React reutilizara el mismo nodo DOM,
                el click de "Siguiente" mutaría a type=submit durante el evento
                y el navegador enviaría el form al llegar al último paso. */}
            {isLastStep ? (
              <button
                key="submit"
                type="submit"
                disabled={isSubmitting}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm outline-none transition hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 active:scale-[0.98] disabled:opacity-60"
              >
                {isSubmitting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <UserPlus className="h-3.5 w-3.5" />
                )}
                Crear empleado
              </button>
            ) : (
              <button
                key="next"
                type="button"
                onClick={goNext}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm outline-none transition hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 active:scale-[0.98]"
              >
                Siguiente <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </form>
      </FormProvider>
    </div>
  )
}
