'use client'

import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  AlertTriangle,
  Download,
  ExternalLink,
  FileText,
  FileUp,
  Image as ImageIcon,
  ImagePlus,
  Loader2,
  Trash2,
} from 'lucide-react'
import { getLabDocumentDownloadUrl } from '@/modules/storage/actions/getLabDocumentDownloadUrl'
import { getLabFileUrl } from '@/modules/storage/actions/getLabFileUrl'
import { removeLabDocument } from '@/modules/storage/actions/removeLabDocument'
import { removeLabFile } from '@/modules/storage/actions/removeLabFile'
import { uploadLabDocument } from '@/modules/storage/actions/uploadLabDocument'
import { uploadLabImage } from '@/modules/storage/actions/uploadLabImage'
import type { ArchivoLabItem, DocumentoLabItem } from '@/modules/storage/types'

interface StorageLabProps {
  items: ArchivoLabItem[]
  /** Error al listar fotos (si lo hubo): la página igual se renderiza para poder subir. */
  listError: string | null
  documents: DocumentoLabItem[]
  documentsError: string | null
}

function formatSize(sizeBytes: number | null): string {
  if (sizeBytes === null) {
    return '—'
  }
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`
  }
  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`
  }
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
}

function baseName(path: string): string {
  return path.split('/').pop() ?? path
}

const PRIMARY_BUTTON_CLASSES =
  'flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm outline-none transition hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60'

const ICON_BUTTON_CLASSES =
  'rounded-lg p-1.5 text-slate-500 outline-none transition hover:bg-slate-100 hover:text-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500/60 disabled:opacity-50'

/**
 * Laboratorio TEMPORAL del core de storage (SGRH-60, fases 1A/1B): prueba
 * subida validada, URLs firmadas, descarga forzada de documentos, listado y
 * borrado contra el proveedor real. Se elimina cuando la fase 2 integre la
 * foto en el módulo de empleados.
 */
export function StorageLab({ items, listError, documents, documentsError }: StorageLabProps) {
  const [serverError, setServerError] = useState<string | null>(listError ?? documentsError)
  const [isPending, startTransition] = useTransition()
  const [removingPath, setRemovingPath] = useState<string | null>(null)
  // path → nombre original sanitizado, devuelto por la action al subir. Solo
  // vive en esta sesión: tras recargar cae al nombre UUID del path (en fase 3
  // el nombre persistirá en sgrh_documentos).
  const [documentNames, setDocumentNames] = useState<Record<string, string>>({})
  const imageInputRef = useRef<HTMLInputElement>(null)
  const documentInputRef = useRef<HTMLInputElement>(null)

  function onImageSelected(fileList: FileList | null) {
    const file = fileList?.[0]
    if (!file) {
      return
    }

    setServerError(null)
    const formData = new FormData()
    formData.set('file', file)

    startTransition(async () => {
      const result = await uploadLabImage(formData)
      // Permite volver a elegir el mismo archivo tras un error.
      if (imageInputRef.current) {
        imageInputRef.current.value = ''
      }
      if (!result.ok) {
        setServerError(result.error)
        return
      }
      toast.success('Imagen subida al laboratorio.')
    })
  }

  function onDocumentSelected(fileList: FileList | null) {
    const file = fileList?.[0]
    if (!file) {
      return
    }

    setServerError(null)
    const formData = new FormData()
    formData.set('file', file)

    startTransition(async () => {
      const result = await uploadLabDocument(formData)
      if (documentInputRef.current) {
        documentInputRef.current.value = ''
      }
      if (!result.ok) {
        setServerError(result.error)
        return
      }
      setDocumentNames((names) => ({ ...names, [result.path]: result.fileName }))
      toast.success(`Documento "${result.fileName}" subido al laboratorio.`)
    })
  }

  function onViewImage(path: string) {
    startTransition(async () => {
      // Firma fresca al momento del clic: la de la lista puede haber expirado.
      const result = await getLabFileUrl(path)
      if (!result.ok) {
        setServerError(result.error)
        return
      }
      window.open(result.url, '_blank', 'noopener,noreferrer')
    })
  }

  function onDownloadDocument(path: string) {
    startTransition(async () => {
      // Firma de 60 s con Content-Disposition: attachment — el navegador baja
      // el archivo sin abrirlo en nuestro origen.
      const result = await getLabDocumentDownloadUrl(path, documentNames[path] ?? baseName(path))
      if (!result.ok) {
        setServerError(result.error)
        return
      }
      window.location.assign(result.url)
    })
  }

  function onRemoveImage(path: string) {
    setServerError(null)
    setRemovingPath(path)
    startTransition(async () => {
      const result = await removeLabFile(path)
      setRemovingPath(null)
      if (!result.ok) {
        setServerError(result.error)
        return
      }
      toast.success('Archivo eliminado.')
    })
  }

  function onRemoveDocument(path: string) {
    setServerError(null)
    setRemovingPath(path)
    startTransition(async () => {
      const result = await removeLabDocument(path)
      setRemovingPath(null)
      if (!result.ok) {
        setServerError(result.error)
        return
      }
      toast.success('Documento eliminado.')
    })
  }

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-sm font-semibold text-slate-900">Laboratorio de storage</h2>
        <p className="text-xs text-slate-500">
          Herramienta temporal (SGRH-60): valida subida segura, URLs firmadas y aislamiento por
          empresa.
        </p>
      </header>

      {serverError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />
          <div>{serverError}</div>
        </div>
      )}

      {/* ─── Fotos (fase 1A): render inline con URL firmada ─────────────── */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Fotos — JPG, PNG o WebP, máximo 5 MB
        </h3>
        <div>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            data-testid="storage-lab-file-input"
            onChange={(e) => onImageSelected(e.target.files)}
          />
          <button
            type="button"
            disabled={isPending}
            onClick={() => imageInputRef.current?.click()}
            className={PRIMARY_BUTTON_CLASSES}
          >
            {isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ImagePlus className="h-3.5 w-3.5" />
            )}
            Subir imagen
          </button>
        </div>

        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">
            No hay archivos en el laboratorio. Sube una imagen para probar el ciclo completo.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((item) => (
              <li
                key={item.path}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
              >
                {/* La URL firmada es un string opaco: el cliente no sabe qué proveedor hay detrás. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.url}
                  alt={`Archivo ${baseName(item.path)}`}
                  className="h-28 w-full object-cover"
                />
                <div className="space-y-1.5 p-2">
                  <p className="truncate text-[11px] text-slate-500" title={item.path}>
                    {baseName(item.path)}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-slate-600">
                      {formatSize(item.sizeBytes)}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onViewImage(item.path)}
                        disabled={isPending}
                        title="Ver con URL firmada fresca"
                        className={ICON_BUTTON_CLASSES}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        <span className="sr-only">Ver {baseName(item.path)}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveImage(item.path)}
                        disabled={isPending}
                        title="Eliminar"
                        className="rounded-lg p-1.5 text-slate-500 outline-none transition hover:bg-rose-50 hover:text-rose-600 focus-visible:ring-2 focus-visible:ring-rose-500/60 disabled:opacity-50"
                      >
                        {removingPath === item.path ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                        <span className="sr-only">Eliminar {baseName(item.path)}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ─── Documentos (fase 1B): NUNCA inline, solo descarga forzada ──── */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Documentos — PDF, JPG o PNG, máximo 10 MB
        </h3>
        <div>
          <input
            ref={documentInputRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            className="hidden"
            data-testid="storage-lab-document-input"
            onChange={(e) => onDocumentSelected(e.target.files)}
          />
          <button
            type="button"
            disabled={isPending}
            onClick={() => documentInputRef.current?.click()}
            className={PRIMARY_BUTTON_CLASSES}
          >
            {isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileUp className="h-3.5 w-3.5" />
            )}
            Subir documento
          </button>
        </div>

        {documents.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">
            No hay documentos en el laboratorio. Sube un PDF para probar la descarga forzada.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-sm">
            {documents.map((doc) => {
              const displayName = documentNames[doc.path] ?? baseName(doc.path)
              const isPdf = doc.contentType === 'application/pdf' || doc.path.endsWith('.pdf')
              return (
                <li key={doc.path} className="flex items-center gap-3 px-3 py-2">
                  {isPdf ? (
                    <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                  ) : (
                    <ImageIcon className="h-4 w-4 shrink-0 text-slate-400" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-slate-700" title={doc.path}>
                      {displayName}
                    </p>
                    <p className="text-[11px] text-slate-500">{formatSize(doc.sizeBytes)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDownloadDocument(doc.path)}
                    disabled={isPending}
                    title="Descargar (URL firmada de 60 s)"
                    className={ICON_BUTTON_CLASSES}
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span className="sr-only">Descargar {displayName}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveDocument(doc.path)}
                    disabled={isPending}
                    title="Eliminar"
                    className="rounded-lg p-1.5 text-slate-500 outline-none transition hover:bg-rose-50 hover:text-rose-600 focus-visible:ring-2 focus-visible:ring-rose-500/60 disabled:opacity-50"
                  >
                    {removingPath === doc.path ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                    <span className="sr-only">Eliminar {displayName}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
