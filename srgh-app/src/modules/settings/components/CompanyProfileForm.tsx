'use client'

import { useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { CARD, SPINNER } from '@/components/ui/styles'
import {
  AddressFields,
  getFieldError,
  INPUT_CLASSES,
  Labeled,
} from '@/modules/employees/components/EmployeeFields'
import type { TerritorioCatalogo } from '@/modules/employees/types'
import { updateCompanyProfile } from '@/modules/settings/actions/updateCompanyProfile'
import {
  companyProfileSchema,
  type CompanyProfile,
  type CompanyProfileData,
  type CompanyProfileInput,
} from '@/modules/settings/types'

interface CompanyProfileFormProps {
  profile: CompanyProfile
  territorio: TerritorioCatalogo
  /** Guardado con éxito: el panel vuelve a modo lectura. */
  onSuccess: () => void
  onCancel: () => void
}

/**
 * Modo edición de los datos de la empresa: identidad, contacto y dirección.
 * La dirección reusa los mismos campos (provincia → cantón → distrito) del
 * alta de empleados. La cédula jurídica se muestra pero no se edita.
 */
export function CompanyProfileForm({
  profile,
  territorio,
  onSuccess,
  onCancel,
}: CompanyProfileFormProps) {
  const [serverError, setServerError] = useState<string | null>(null)

  const methods = useForm<CompanyProfileInput, unknown, CompanyProfileData>({
    resolver: zodResolver(companyProfileSchema),
    defaultValues: {
      org_nombre_social: profile.org_nombre_social,
      org_nombre_fantasia: profile.org_nombre_fantasia ?? '',
      org_email_corporativo: profile.org_email_corporativo ?? '',
      org_telefono: profile.org_telefono ?? '',
      org_representante_legal: profile.org_representante_legal ?? '',
      org_actividad_economica_ciiu: profile.org_actividad_economica_ciiu ?? '',
      direccion: profile.direccion ?? { dir_senas_exactas: '' },
    },
  })

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = methods
  const err = (path: string) => getFieldError(errors, path)

  async function onSubmit(data: CompanyProfileData) {
    setServerError(null)
    const result = await updateCompanyProfile(data)
    if (!result.ok) {
      setServerError(result.error)
      return
    }
    toast.success('Datos de la empresa actualizados.')
    // La acción revalida: el panel recibe los datos nuevos al volver a lectura.
    onSuccess()
  }

  return (
    <FormProvider {...methods}>
      {/* @container: AddressFields reparte sus columnas con container queries
          (@sm/@2xl), igual que en el formulario del empleado. Sin un ancestro
          @container la grilla se desarma. */}
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="@container space-y-4">
        {serverError && <Alert>{serverError}</Alert>}

        <section className={`${CARD} space-y-3 p-4`} aria-labelledby="company-identity">
          <h3 id="company-identity" className="text-sm font-bold text-slate-900">
            Identidad
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Labeled label="Razón social *" error={err('org_nombre_social')}>
              <input
                className={INPUT_CLASSES}
                aria-invalid={Boolean(err('org_nombre_social'))}
                {...register('org_nombre_social')}
              />
            </Labeled>
            <Labeled label="Nombre comercial" error={err('org_nombre_fantasia')}>
              <input
                className={INPUT_CLASSES}
                aria-invalid={Boolean(err('org_nombre_fantasia'))}
                placeholder="El que se muestra en el menú"
                {...register('org_nombre_fantasia')}
              />
            </Labeled>
            <Labeled label="Cédula jurídica">
              <input
                className={INPUT_CLASSES}
                value={profile.org_cedula_juridica}
                readOnly
                disabled
                aria-describedby="cedula-juridica-help"
              />
            </Labeled>
            <Labeled label="Representante legal" error={err('org_representante_legal')}>
              <input
                className={INPUT_CLASSES}
                aria-invalid={Boolean(err('org_representante_legal'))}
                {...register('org_representante_legal')}
              />
            </Labeled>
            <Labeled label="Actividad económica (CIIU)" error={err('org_actividad_economica_ciiu')}>
              <input
                className={INPUT_CLASSES}
                aria-invalid={Boolean(err('org_actividad_economica_ciiu'))}
                inputMode="numeric"
                {...register('org_actividad_economica_ciiu')}
              />
            </Labeled>
          </div>
          <p id="cedula-juridica-help" className="text-xs text-slate-500">
            La cédula jurídica es el identificador legal de la empresa y no se cambia desde acá.
          </p>
        </section>

        <section className={`${CARD} space-y-3 p-4`} aria-labelledby="company-contact">
          <h3 id="company-contact" className="text-sm font-bold text-slate-900">
            Contacto
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Labeled label="Correo corporativo" error={err('org_email_corporativo')}>
              <input
                type="email"
                className={INPUT_CLASSES}
                aria-invalid={Boolean(err('org_email_corporativo'))}
                {...register('org_email_corporativo')}
              />
            </Labeled>
            <Labeled label="Teléfono" error={err('org_telefono')}>
              <input
                type="tel"
                className={INPUT_CLASSES}
                aria-invalid={Boolean(err('org_telefono'))}
                {...register('org_telefono')}
              />
            </Labeled>
          </div>
        </section>

        <section className={`${CARD} space-y-3 p-4`} aria-labelledby="company-address">
          <h3 id="company-address" className="text-sm font-bold text-slate-900">
            Dirección
          </h3>
          <AddressFields basePath="direccion." territorio={territorio} />
        </section>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!isDirty || isSubmitting}>
            {isSubmitting && <Loader2 className={SPINNER} />}
            Guardar cambios
          </Button>
        </div>
      </form>
    </FormProvider>
  )
}
