'use client'

import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import {
  documentoMetadataSchema,
  type CatalogoItem,
  type DocumentoMetadataInput,
} from '@/modules/employees/types'
import { Button } from '@/components/ui/Button'
import { FIELD_ERROR, INPUT, LABEL, SELECT, SPINNER } from '@/components/ui/styles'
import { Alert } from '@/components/ui/Alert'

interface DocumentMetadataFormProps {
  tiposDocumento: CatalogoItem[]
  defaultValues?: Partial<DocumentoMetadataInput>
  serverError?: string | null
  submitLabel?: string
  onCancel: () => void
  onSubmit: (values: DocumentoMetadataInput) => void | Promise<void>
}

/**
 * Formulario puro de metadata de un documento (SGRH-67, fase 2B): NO llama
 * ninguna Server Action — el padre decide qué hacer con los valores
 * validados (agregarlos a la cola local del wizard, o subirlos de una vez
 * en el perfil). Reutilizado tal cual en ambos flujos, dentro del mismo
 * `Modal` compartido.
 *
 * El contenedor es un <div>, NO un <form>: en el wizard este modal se
 * renderiza DENTRO del <form> del onboarding, y HTML prohíbe anidar
 * formularios (React lo reporta como error de hidratación y remonta el
 * árbol, perdiendo todo lo capturado). El submit se dispara a mano desde el
 * botón y con Enter en los campos de una línea.
 */
export function DocumentMetadataForm({
  tiposDocumento,
  defaultValues,
  serverError,
  submitLabel = 'Guardar',
  onCancel,
  onSubmit,
}: DocumentMetadataFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DocumentoMetadataInput>({
    // z.preprocess (emptyToNull) vuelve `unknown` el lado input del schema;
    // el formulario trabaja con el tipo de salida (mismo criterio que
    // EmployeeWizard con onboardingEmpleadoSchema).
    resolver: zodResolver(documentoMetadataSchema) as Resolver<DocumentoMetadataInput>,
    defaultValues: {
      doc_nombre: defaultValues?.doc_nombre ?? '',
      doc_tipo_id: defaultValues?.doc_tipo_id,
      doc_descripcion: defaultValues?.doc_descripcion ?? '',
      doc_fecha_vencimiento: defaultValues?.doc_fecha_vencimiento ?? '',
    },
  })

  const submit = handleSubmit(async (values) => {
    await onSubmit(values)
  })

  return (
    <div
      className="space-y-3"
      onKeyDown={(e) => {
        // Enter confirma, como en un form real — salvo en el textarea, donde
        // es un salto de línea legítimo.
        if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
          e.preventDefault()
          void submit()
        }
      }}
    >
      {serverError && (
        <Alert>
          <div>{serverError}</div>
        </Alert>
      )}

      <div>
        <label className={LABEL} htmlFor="doc_nombre">
          Nombre del documento
        </label>
        <input
          id="doc_nombre"
          disabled={isSubmitting}
          aria-invalid={!!errors.doc_nombre}
          {...register('doc_nombre')}
          className={INPUT}
          placeholder="Ej: Contrato firmado 2026"
        />
        {errors.doc_nombre && <p className={FIELD_ERROR}>{errors.doc_nombre.message}</p>}
      </div>

      <div>
        <label className={LABEL} htmlFor="doc_tipo_id">
          Tipo de documento
        </label>
        <select
          id="doc_tipo_id"
          disabled={isSubmitting}
          aria-invalid={!!errors.doc_tipo_id}
          {...register('doc_tipo_id', { valueAsNumber: true })}
          className={SELECT}
        >
          <option value="">Seleccionar…</option>
          {tiposDocumento.map((tipo) => (
            <option key={tipo.id} value={tipo.id}>
              {tipo.nombre}
            </option>
          ))}
        </select>
        {errors.doc_tipo_id && <p className={FIELD_ERROR}>{errors.doc_tipo_id.message}</p>}
      </div>

      <div>
        <label className={LABEL} htmlFor="doc_descripcion">
          Descripción (opcional)
        </label>
        <textarea
          id="doc_descripcion"
          rows={2}
          disabled={isSubmitting}
          aria-invalid={!!errors.doc_descripcion}
          {...register('doc_descripcion')}
          className={`${INPUT} resize-none`}
          placeholder="Notas sobre este documento…"
        />
        {errors.doc_descripcion && <p className={FIELD_ERROR}>{errors.doc_descripcion.message}</p>}
      </div>

      <div>
        <label className={LABEL} htmlFor="doc_fecha_vencimiento">
          Fecha de vencimiento (opcional)
        </label>
        <input
          id="doc_fecha_vencimiento"
          type="date"
          disabled={isSubmitting}
          aria-invalid={!!errors.doc_fecha_vencimiento}
          {...register('doc_fecha_vencimiento')}
          className={INPUT}
        />
        {errors.doc_fecha_vencimiento && (
          <p className={FIELD_ERROR}>{errors.doc_fecha_vencimiento.message}</p>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button onClick={onCancel} disabled={isSubmitting} variant="secondary" size="md">
          Cancelar
        </Button>
        {/* type="button": este bloque no es un <form>, y en el wizard un
            submit real enviaría el formulario del onboarding. */}
        <Button onClick={() => void submit()} disabled={isSubmitting} size="md">
          {isSubmitting && <Loader2 className={SPINNER} />}
          {submitLabel}
        </Button>
      </div>
    </div>
  )
}
