'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, UserPlus } from 'lucide-react'
import { nuevoCandidatoSchema, type NuevoCandidatoInput } from '@/modules/recruitment/types'
import type { CatalogoItem } from '@/modules/employees/types'
import { createCandidateWithPostulacion } from '@/modules/recruitment/actions/createCandidateWithPostulacion'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { FIELD_ERROR, INPUT, LABEL, SELECT, SPINNER } from '@/components/ui/styles'

interface NuevoCandidatoFormProps {
  tiposIdentificacion: CatalogoItem[]
  puestos: CatalogoItem[]
  sucursales: CatalogoItem[]
  onSuccess?: () => void
}

/**
 * Alta de candidato + primera postulación en un solo submit (botón "Nuevo
 * candidato" del tablero). Al terminar redirige a la ficha del candidato —
 * no hay lista de candidatos separada, el tablero y la ficha son las dos
 * únicas superficies del módulo.
 */
export function NuevoCandidatoForm({
  tiposIdentificacion,
  puestos,
  sucursales,
  onSuccess,
}: NuevoCandidatoFormProps) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<NuevoCandidatoInput>({
    // z.preprocess (emptyToNull) vuelve `unknown` el lado input del schema;
    // el formulario trabaja con el tipo de salida — mismo cast que
    // EmployeeWizard.tsx con onboardingEmpleadoSchema.
    resolver: zodResolver(nuevoCandidatoSchema) as Resolver<NuevoCandidatoInput>,
    defaultValues: {
      candidato: {
        cdt_nombre: '',
        cdt_apellido_1: '',
        cdt_apellido_2: '',
        cdt_numero_identificacion: '',
        cdt_email: '',
        cdt_telefono: '',
        cdt_fuente_reclutamiento: '',
      },
      postulacion: { pos_observaciones: '' },
    },
  })

  async function onSubmit(input: NuevoCandidatoInput) {
    setServerError(null)
    const result = await createCandidateWithPostulacion(input)

    if (!result.ok) {
      setServerError(result.error)
      return
    }

    onSuccess?.()
    router.push(`/recruitment/candidates/${result.candidatoId}`)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {serverError && (
        <Alert>
          <div>{serverError}</div>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="cdt_nombre">
            Nombre
          </label>
          <input
            id="cdt_nombre"
            disabled={isSubmitting}
            aria-invalid={!!errors.candidato?.cdt_nombre}
            {...register('candidato.cdt_nombre')}
            className={INPUT}
          />
          {errors.candidato?.cdt_nombre && (
            <p className={FIELD_ERROR}>{errors.candidato.cdt_nombre.message}</p>
          )}
        </div>

        <div>
          <label className={LABEL} htmlFor="cdt_apellido_1">
            Primer apellido
          </label>
          <input
            id="cdt_apellido_1"
            disabled={isSubmitting}
            aria-invalid={!!errors.candidato?.cdt_apellido_1}
            {...register('candidato.cdt_apellido_1')}
            className={INPUT}
          />
          {errors.candidato?.cdt_apellido_1 && (
            <p className={FIELD_ERROR}>{errors.candidato.cdt_apellido_1.message}</p>
          )}
        </div>

        <div>
          <label className={LABEL} htmlFor="cdt_apellido_2">
            Segundo apellido
          </label>
          <input
            id="cdt_apellido_2"
            disabled={isSubmitting}
            {...register('candidato.cdt_apellido_2')}
            className={INPUT}
          />
        </div>

        <div>
          <label className={LABEL} htmlFor="cdt_tipo_identificacion_id">
            Tipo de identificación
          </label>
          <select
            id="cdt_tipo_identificacion_id"
            disabled={isSubmitting}
            aria-invalid={!!errors.candidato?.cdt_tipo_identificacion_id}
            {...register('candidato.cdt_tipo_identificacion_id', { valueAsNumber: true })}
            className={SELECT}
            defaultValue=""
          >
            <option value="" disabled>
              Seleccionar…
            </option>
            {tiposIdentificacion.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
          {errors.candidato?.cdt_tipo_identificacion_id && (
            <p className={FIELD_ERROR}>{errors.candidato.cdt_tipo_identificacion_id.message}</p>
          )}
        </div>

        <div>
          <label className={LABEL} htmlFor="cdt_numero_identificacion">
            Número de identificación
          </label>
          <input
            id="cdt_numero_identificacion"
            disabled={isSubmitting}
            aria-invalid={!!errors.candidato?.cdt_numero_identificacion}
            {...register('candidato.cdt_numero_identificacion')}
            className={INPUT}
          />
          {errors.candidato?.cdt_numero_identificacion && (
            <p className={FIELD_ERROR}>{errors.candidato.cdt_numero_identificacion.message}</p>
          )}
        </div>

        <div>
          <label className={LABEL} htmlFor="cdt_email">
            Correo
          </label>
          <input
            id="cdt_email"
            type="email"
            disabled={isSubmitting}
            aria-invalid={!!errors.candidato?.cdt_email}
            {...register('candidato.cdt_email')}
            className={INPUT}
          />
          {errors.candidato?.cdt_email && (
            <p className={FIELD_ERROR}>{errors.candidato.cdt_email.message}</p>
          )}
        </div>

        <div>
          <label className={LABEL} htmlFor="cdt_telefono">
            Teléfono
          </label>
          <input
            id="cdt_telefono"
            disabled={isSubmitting}
            aria-invalid={!!errors.candidato?.cdt_telefono}
            {...register('candidato.cdt_telefono')}
            className={INPUT}
          />
          {errors.candidato?.cdt_telefono && (
            <p className={FIELD_ERROR}>{errors.candidato.cdt_telefono.message}</p>
          )}
        </div>

        <div>
          <label className={LABEL} htmlFor="cdt_fuente_reclutamiento">
            Fuente (opcional)
          </label>
          <input
            id="cdt_fuente_reclutamiento"
            disabled={isSubmitting}
            placeholder="Referido, WhatsApp, redes…"
            {...register('candidato.cdt_fuente_reclutamiento')}
            className={INPUT}
          />
        </div>
      </div>

      <div className="border-t border-slate-100 pt-3">
        <p className="mb-2 text-xs font-bold text-slate-900">Postula a</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={LABEL} htmlFor="pos_puesto_id">
              Puesto
            </label>
            <select
              id="pos_puesto_id"
              disabled={isSubmitting}
              aria-invalid={!!errors.postulacion?.pos_puesto_id}
              {...register('postulacion.pos_puesto_id', { valueAsNumber: true })}
              className={SELECT}
              defaultValue=""
            >
              <option value="" disabled>
                Seleccionar…
              </option>
              {puestos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
            {errors.postulacion?.pos_puesto_id && (
              <p className={FIELD_ERROR}>{errors.postulacion.pos_puesto_id.message}</p>
            )}
          </div>

          <div>
            <label className={LABEL} htmlFor="pos_sucursal_id">
              Sucursal (opcional)
            </label>
            <select
              id="pos_sucursal_id"
              disabled={isSubmitting}
              {...register('postulacion.pos_sucursal_id', { valueAsNumber: true })}
              className={SELECT}
              defaultValue=""
            >
              <option value="">Sin especificar</option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <Button type="submit" disabled={isSubmitting} size="lg" block>
        {isSubmitting ? (
          <>
            <Loader2 className={SPINNER} /> Guardando
          </>
        ) : (
          <>
            <UserPlus className="h-3.5 w-3.5" /> Registrar candidato
          </>
        )}
      </Button>
    </form>
  )
}
