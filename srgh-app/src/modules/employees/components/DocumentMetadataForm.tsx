'use client'

import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, Loader2 } from 'lucide-react'
import {
  documentoMetadataSchema,
  type CatalogoItem,
  type DocumentoMetadataInput,
} from '@/modules/employees/types'

interface DocumentMetadataFormProps {
  tiposDocumento: CatalogoItem[]
  defaultValues?: Partial<DocumentoMetadataInput>
  serverError?: string | null
  submitLabel?: string
  onCancel: () => void
  onSubmit: (values: DocumentoMetadataInput) => void | Promise<void>
}

const INPUT_CLASSES =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-600/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 aria-[invalid=true]:border-rose-400 aria-[invalid=true]:focus:ring-rose-400/20'

const LABEL_CLASSES = 'mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500'

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
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />
          <div>{serverError}</div>
        </div>
      )}

      <div>
        <label className={LABEL_CLASSES} htmlFor="doc_nombre">
          Nombre del documento
        </label>
        <input
          id="doc_nombre"
          disabled={isSubmitting}
          aria-invalid={!!errors.doc_nombre}
          {...register('doc_nombre')}
          className={INPUT_CLASSES}
          placeholder="Ej: Contrato firmado 2026"
        />
        {errors.doc_nombre && (
          <p className="mt-1.5 text-xs text-rose-600">{errors.doc_nombre.message}</p>
        )}
      </div>

      <div>
        <label className={LABEL_CLASSES} htmlFor="doc_tipo_id">
          Tipo de documento
        </label>
        <select
          id="doc_tipo_id"
          disabled={isSubmitting}
          aria-invalid={!!errors.doc_tipo_id}
          {...register('doc_tipo_id', { valueAsNumber: true })}
          className={INPUT_CLASSES}
        >
          <option value="">Seleccionar…</option>
          {tiposDocumento.map((tipo) => (
            <option key={tipo.id} value={tipo.id}>
              {tipo.nombre}
            </option>
          ))}
        </select>
        {errors.doc_tipo_id && (
          <p className="mt-1.5 text-xs text-rose-600">{errors.doc_tipo_id.message}</p>
        )}
      </div>

      <div>
        <label className={LABEL_CLASSES} htmlFor="doc_descripcion">
          Descripción (opcional)
        </label>
        <textarea
          id="doc_descripcion"
          rows={2}
          disabled={isSubmitting}
          aria-invalid={!!errors.doc_descripcion}
          {...register('doc_descripcion')}
          className={`${INPUT_CLASSES} resize-none`}
          placeholder="Notas sobre este documento…"
        />
        {errors.doc_descripcion && (
          <p className="mt-1.5 text-xs text-rose-600">{errors.doc_descripcion.message}</p>
        )}
      </div>

      <div>
        <label className={LABEL_CLASSES} htmlFor="doc_fecha_vencimiento">
          Fecha de vencimiento (opcional)
        </label>
        <input
          id="doc_fecha_vencimiento"
          type="date"
          disabled={isSubmitting}
          aria-invalid={!!errors.doc_fecha_vencimiento}
          {...register('doc_fecha_vencimiento')}
          className={INPUT_CLASSES}
        />
        {errors.doc_fecha_vencimiento && (
          <p className="mt-1.5 text-xs text-rose-600">{errors.doc_fecha_vencimiento.message}</p>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-500/60 disabled:opacity-60"
        >
          Cancelar
        </button>
        {/* type="button": este bloque no es un <form>, y en el wizard un
            submit real enviaría el formulario del onboarding. */}
        <button
          type="button"
          onClick={() => void submit()}
          disabled={isSubmitting}
          className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm outline-none transition hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {submitLabel}
        </button>
      </div>
    </div>
  )
}
