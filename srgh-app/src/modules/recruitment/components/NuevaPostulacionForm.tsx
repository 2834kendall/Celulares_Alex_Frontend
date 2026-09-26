'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Send } from 'lucide-react'
import { postulacionSchema, type PostulacionInput } from '@/modules/recruitment/types'
import type { CatalogoItem } from '@/modules/employees/types'
import { createPostulacion } from '@/modules/recruitment/actions/createPostulacion'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { FIELD_ERROR, INPUT, LABEL, SPINNER } from '@/components/ui/styles'
import { ControlledSelectMenu, parseNumber, parseOptionalNumber } from '@/components/ui/SelectMenu'

interface NuevaPostulacionFormProps {
  candidatoId: number
  puestos: CatalogoItem[]
  sucursales: CatalogoItem[]
  onSuccess?: () => void
}

/** Nueva postulación para un candidato que ya existe (ver ficha del candidato). */
export function NuevaPostulacionForm({
  candidatoId,
  puestos,
  sucursales,
  onSuccess,
}: NuevaPostulacionFormProps) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PostulacionInput>({
    resolver: zodResolver(postulacionSchema) as Resolver<PostulacionInput>,
    defaultValues: { pos_observaciones: '' },
  })

  async function onSubmit(input: PostulacionInput) {
    setServerError(null)
    const result = await createPostulacion(candidatoId, input)

    if (!result.ok) {
      setServerError(result.error)
      return
    }

    toast.success('Postulación creada.')
    onSuccess?.()
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
      {serverError && (
        <Alert>
          <div>{serverError}</div>
        </Alert>
      )}

      <div>
        <label className={LABEL} htmlFor="np_pos_puesto_id">
          Puesto
        </label>
        <ControlledSelectMenu
          control={control}
          name="pos_puesto_id"
          id="np_pos_puesto_id"
          parse={parseNumber}
          disabled={isSubmitting}
          invalid={!!errors.pos_puesto_id}
          placeholder="Seleccionar…"
          options={puestos.map((item) => ({ value: String(item.id), label: item.nombre }))}
        />
        {errors.pos_puesto_id && <p className={FIELD_ERROR}>{errors.pos_puesto_id.message}</p>}
      </div>

      <div>
        <label className={LABEL} htmlFor="np_pos_sucursal_id">
          Sucursal (opcional)
        </label>
        <ControlledSelectMenu
          control={control}
          name="pos_sucursal_id"
          id="np_pos_sucursal_id"
          parse={parseOptionalNumber}
          disabled={isSubmitting}
          placeholder="Sin especificar"
          options={[
            { value: '', label: 'Sin especificar' },
            ...sucursales.map((item) => ({ value: String(item.id), label: item.nombre })),
          ]}
        />
      </div>

      <div>
        <label className={LABEL} htmlFor="np_pos_observaciones">
          Observaciones (opcional)
        </label>
        <textarea
          id="np_pos_observaciones"
          rows={2}
          disabled={isSubmitting}
          {...register('pos_observaciones')}
          className={`${INPUT} resize-none`}
        />
      </div>

      <Button type="submit" disabled={isSubmitting} size="lg" block>
        {isSubmitting ? (
          <>
            <Loader2 className={SPINNER} /> Guardando
          </>
        ) : (
          <>
            <Send className="h-3.5 w-3.5" /> Registrar postulación
          </>
        )}
      </Button>
    </form>
  )
}
