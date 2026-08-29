'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FormProvider, useForm, type Path, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, ArrowRight, Loader2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import {
  onboardingEmpleadoSchema,
  type CatalogoItem,
  type DocumentoPendiente,
  type OnboardingEmpleadoInput,
  type TerritorioCatalogo,
} from '@/modules/employees/types'
import { createEmployee } from '@/modules/employees/actions/createEmployee'
import { setEmployeePhoto } from '@/modules/employees/actions/setEmployeePhoto'
import { addEmployeeDocument } from '@/modules/employees/actions/addEmployeeDocument'
import { formatCRC, formatDate, fullName } from '@/modules/employees/lib/format'
import { WizardStepper, type WizardStep } from './WizardStepper'
import { EmployeeWizardStepPersonal } from './EmployeeWizardStepPersonal'
import { EmployeeWizardStepNomina } from './EmployeeWizardStepNomina'
import { EmployeeWizardStepDocumentos } from './EmployeeWizardStepDocumentos'
import { EmployeeWizardStepUsuario } from './EmployeeWizardStepUsuario'
import { Button } from '@/components/ui/Button'
import { META_LABEL, SPINNER } from '@/components/ui/styles'
import { Alert } from '@/components/ui/Alert'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

const STEPS: WizardStep[] = [
  { id: 'personal', label: 'Información principal' },
  { id: 'nomina', label: 'Datos de nómina' },
  { id: 'documentos', label: 'Documentos' },
  { id: 'usuario', label: 'Revisión y usuario' },
]

// Campos que valida el botón "Siguiente" de cada paso. Documentos (paso 3) y
// usuario (paso 4) se validan completos en el submit: sus campos no viven en
// este mismo schema (documentos) o solo existen si el toggle está activo
// (usuario).
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
    'direccion.dir_distrito_id',
    'direccion.dir_senas_exactas',
  ],
  [
    'contratacion.lab_puesto_id',
    'contratacion.lab_sucursal_id',
    'contratacion.lab_tipo_contrato_id',
    'contratacion.lab_tipo_jornada_id',
    'contratacion.lab_fecha_inicio',
    'contratacion.lab_salario_base',
    'contratacion.lab_salario_real',
    'datos_pago.edp_banco_id',
    'datos_pago.edp_tipo_cuenta',
    'datos_pago.edp_numero_cuenta',
  ],
  [],
  [],
]

function nombreDe(items: CatalogoItem[], id: number | undefined) {
  return items.find((item) => item.id === id)?.nombre ?? '—'
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className={META_LABEL}>{label}</dt>
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
  territorio: TerritorioCatalogo
}

/** Resumen de lo capturado en los pasos 1 y 2, para revisar antes de crear. */
function OnboardingSummary({
  values,
  puestos,
  sucursales,
  tiposContrato,
  tiposJornada,
  territorio,
}: OnboardingSummaryProps) {
  const { empleado, contratacion, direccion } = values

  // El resumen muestra la cadena completa aunque solo se guarde el distrito.
  const distrito = territorio.distritos.find((d) => d.id === direccion?.dir_distrito_id)
  const canton = distrito && territorio.cantones.find((c) => c.id === distrito.cantonId)
  const provincia = canton && territorio.provincias.find((p) => p.id === canton.provinciaId)
  const ubicacion = distrito
    ? `${provincia?.nombre ?? '—'}, ${canton?.nombre ?? '—'}, ${distrito.nombre} (${distrito.codigoPostal})`
    : '—'

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
        <div className="sm:col-span-2 lg:col-span-4">
          <SummaryItem label="Dirección" value={ubicacion} />
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <SummaryItem label="Señas exactas" value={direccion?.dir_senas_exactas || '—'} />
        </div>
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
  bancos: CatalogoItem[]
  territorio: TerritorioCatalogo
  tiposDocumento: CatalogoItem[]
  canManageDocs: boolean
  roles: CatalogoItem[]
  canInviteUser: boolean
}

export function EmployeeWizard({
  tiposIdentificacion,
  puestos,
  sucursales,
  tiposContrato,
  tiposJornada,
  bancos,
  territorio,
  tiposDocumento,
  canManageDocs,
  roles,
  canInviteUser,
}: EmployeeWizardProps) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [crearUsuario, setCrearUsuario] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  // Alta en espera de que el usuario confirme una cuenta bancaria repetida.
  const [duplicado, setDuplicado] = useState<{
    mensaje: string
    values: OnboardingEmpleadoInput
  } | null>(null)
  // El reintento tras confirmar no pasa por handleSubmit, así que isSubmitting
  // no lo cubre y los botones quedarían habilitados durante el alta.
  const [reintentando, setReintentando] = useState(false)
  // Fuera de RHF: un File no viaja por el schema Zod ni por createEmployee
  // (que aún no tiene emp_id). Se sube en onSubmit, tras crear el empleado.
  const [foto, setFoto] = useState<File | null>(null)
  const [documentos, setDocumentos] = useState<DocumentoPendiente[]>([])

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
      direccion: {
        dir_senas_exactas: '',
      },
      contratacion: {
        lab_fecha_inicio: '',
      },
      datos_pago: {
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
    await crearEmpleado(values)
  }

  async function confirmarDuplicado() {
    if (!duplicado) return
    const { values } = duplicado
    setDuplicado(null)
    setReintentando(true)
    try {
      await crearEmpleado(values, true)
    } finally {
      setReintentando(false)
    }
  }

  async function crearEmpleado(values: OnboardingEmpleadoInput, confirmado = false) {
    setServerError(null)

    const result = await createEmployee({ ...values, confirmar_cuenta_duplicada: confirmado })
    if (!result.ok) {
      // La cuenta ya está registrada para otro empleado de la empresa. Puede
      // ser legítimo (cuenta compartida), así que se pregunta en vez de
      // bloquear — y el alta se reintenta entera con el flag.
      if (result.requiereConfirmacion) {
        setDuplicado({ mensaje: result.error, values })
        return
      }
      setServerError(result.error)
      return
    }

    if (result.usuarioWarning) {
      toast.warning(result.usuarioWarning)
    }

    // La foto NUNCA bloquea el alta: si falla, el empleado ya existe y se
    // avisa que puede agregarla después desde su perfil.
    if (foto) {
      const formData = new FormData()
      formData.set('file', foto)
      const fotoResult = await setEmployeePhoto(result.empId, formData)
      if (!fotoResult.ok) {
        toast.warning(
          `Empleado creado, pero la foto no se pudo subir: ${fotoResult.error} Puedes agregarla desde su perfil.`
        )
      }
    }

    // Los documentos, igual que la foto, nunca bloquean el alta: se suben
    // secuencialmente (uno por request, mismo orden en que se agregaron) y
    // los fallos se acumulan en un solo aviso al final.
    const documentosFallidos: string[] = []
    for (const documento of documentos) {
      const formData = new FormData()
      formData.set('file', documento.file)
      formData.set('doc_nombre', documento.metadata.doc_nombre)
      formData.set('doc_tipo_id', String(documento.metadata.doc_tipo_id))
      if (documento.metadata.doc_descripcion) {
        formData.set('doc_descripcion', documento.metadata.doc_descripcion)
      }
      if (documento.metadata.doc_fecha_vencimiento) {
        formData.set('doc_fecha_vencimiento', documento.metadata.doc_fecha_vencimiento)
      }
      const documentoResult = await addEmployeeDocument(result.empId, formData)
      if (!documentoResult.ok) {
        documentosFallidos.push(documento.metadata.doc_nombre)
      }
    }
    if (documentosFallidos.length > 0) {
      toast.warning(
        `Empleado creado, pero no se pudieron subir: ${documentosFallidos.join(', ')}. Puedes agregarlos desde su perfil.`
      )
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
            <Alert>
              <div>{serverError}</div>
            </Alert>
          )}

          {step === 0 && (
            <EmployeeWizardStepPersonal
              tiposIdentificacion={tiposIdentificacion}
              territorio={territorio}
              foto={foto}
              onFotoChange={setFoto}
            />
          )}
          {step === 1 && (
            <EmployeeWizardStepNomina
              puestos={puestos}
              sucursales={sucursales}
              tiposContrato={tiposContrato}
              tiposJornada={tiposJornada}
              bancos={bancos}
            />
          )}
          {step === 2 && (
            <EmployeeWizardStepDocumentos
              tiposDocumento={tiposDocumento}
              documentos={documentos}
              onChange={setDocumentos}
              canManageDocs={canManageDocs}
            />
          )}
          {step === 3 && (
            <div className="space-y-4">
              <OnboardingSummary
                values={methods.getValues()}
                puestos={puestos}
                sucursales={sucursales}
                tiposContrato={tiposContrato}
                tiposJornada={tiposJornada}
                territorio={territorio}
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
              disabled={step === 0 || isSubmitting || reintentando}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm outline-none transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 disabled:opacity-40"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Anterior
            </button>

            {/* key distinto por botón: si React reutilizara el mismo nodo DOM,
                el click de "Siguiente" mutaría a type=submit durante el evento
                y el navegador enviaría el form al llegar al último paso. */}
            {isLastStep ? (
              <Button key="submit" type="submit" disabled={isSubmitting || reintentando}>
                {isSubmitting || reintentando ? (
                  <Loader2 className={SPINNER} />
                ) : (
                  <UserPlus className="h-3.5 w-3.5" />
                )}
                Crear empleado
              </Button>
            ) : (
              <Button
                key="next"

                onClick={goNext}
              >
                Siguiente <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </form>
      </FormProvider>

      {duplicado && (
        <ConfirmDialog
          title="Cuenta bancaria repetida"
          message={duplicado.mensaje}
          confirmLabel="Crear de todos modos"
          onCancel={() => setDuplicado(null)}
          onConfirm={confirmarDuplicado}
        />
      )}
    </div>
  )
}
