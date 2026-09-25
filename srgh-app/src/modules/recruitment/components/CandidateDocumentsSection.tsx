'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { FileText, Loader2, Trash2 } from 'lucide-react'
import { DocumentDropzone } from '@/components/ui/DocumentDropzone'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Modal } from '@/components/ui/Modal'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { EmptyState } from '@/components/ui/EmptyState'
import { FIELD_ERROR, INPUT, LABEL, SPINNER } from '@/components/ui/styles'
import { cn } from '@/lib/utils/cn'
import type { CandidatoDocumento } from '@/modules/recruitment/types'
import { TIPO_DOCUMENTO_LABELS } from '@/modules/recruitment/lib/format'
import { addCandidateDocument } from '@/modules/recruitment/actions/addCandidateDocument'
import { deleteCandidateDocument } from '@/modules/recruitment/actions/deleteCandidateDocument'
import { getCandidateDocumentDownloadUrl } from '@/modules/recruitment/actions/getCandidateDocumentDownloadUrl'
import { useCrudList } from '@/modules/recruitment/hooks/useCrudList'
import { formatDate } from '@/modules/employees/lib/format'

interface CandidateDocumentsSectionProps {
  candidatoId: number
  documentos: CandidatoDocumento[]
  canWrite: boolean
}

const TIPOS: CandidatoDocumento['cdo_tipo'][] = ['CV', 'CEDULA', 'REFERENCIA', 'TITULO', 'OTRO']

export function CandidateDocumentsSection({
  candidatoId,
  documentos,
  canWrite,
}: CandidateDocumentsSectionProps) {
  const router = useRouter()
  const { deletingId, confirmingId, deleteError, requestDelete, cancelDelete, confirmDelete } =
    useCrudList<CandidatoDocumento>((docId) => deleteCandidateDocument(docId))

  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [tipo, setTipo] = useState<string>('CV')
  const [nombre, setNombre] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [downloadingId, setDownloadingId] = useState<number | null>(null)

  function handleSelect(file: File) {
    setPendingFile(file)
    setNombre(file.name.replace(/\.[^.]+$/, ''))
    setTipo('CV')
    setAddError(null)
  }

  async function handleUploadSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!pendingFile) return
    if (nombre.trim().length < 2) {
      setAddError('Ingrese un nombre para el documento.')
      return
    }

    setUploading(true)
    setAddError(null)
    const formData = new FormData()
    formData.set('file', pendingFile)
    formData.set('cdo_tipo', tipo)
    formData.set('cdo_nombre', nombre.trim())

    const result = await addCandidateDocument(candidatoId, formData)
    setUploading(false)

    if (!result.ok) {
      setAddError(result.error)
      return
    }

    toast.success(`Documento guardado: ${nombre.trim()}.`)
    setPendingFile(null)
    router.refresh()
  }

  // `location.assign` y no `window.open`: la URL firmada llega DESPUÉS de un
  // await, y Safari (iPhone) bloquea como ventana emergente cualquier
  // `window.open` que no salga directo del toque — el CV no abría y no se
  // avisaba nada. Mismo criterio que EmployeeDocumentsSection.
  async function handleDownload(docId: number) {
    setDownloadingId(docId)
    const result = await getCandidateDocumentDownloadUrl(docId)
    setDownloadingId(null)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    window.location.assign(result.url)
  }

  async function handleConfirmDelete() {
    const result = await confirmDelete()
    if (!result.ok) return
    toast.success('Documento eliminado.')
    router.refresh()
  }

  return (
    <div className="min-w-0 space-y-3">
      <DocumentDropzone onSelect={handleSelect} disabled={!canWrite} triggerLabel="Subir documento">
        {documentos.length === 0 ? (
          <EmptyState icon={FileText} title="Sin documentos todavía." />
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {documentos.map((doc) => (
              <div
                key={doc.cdo_id}
                className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,.04)]"
              >
                {/*
                  Ícono + nombre + tipo son UN solo botón: antes solo el
                  nombre (texto de 12px) abría el archivo, un blanco chico
                  para el dedo. Mientras se pide la URL, el ícono pasa a
                  spinner para que se note que el toque llegó.
                */}
                <button
                  type="button"
                  onClick={() => handleDownload(doc.cdo_id)}
                  disabled={downloadingId === doc.cdo_id}
                  aria-label={`Abrir ${doc.cdo_nombre}`}
                  className="group flex min-w-0 flex-1 items-center gap-2.5 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 disabled:cursor-wait"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 transition group-hover:bg-brand-100 group-active:scale-95 motion-reduce:group-active:scale-100">
                    {downloadingId === doc.cdo_id ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <FileText className="h-4 w-4" aria-hidden="true" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-brand-700 group-hover:underline">
                      {doc.cdo_nombre}
                    </span>
                    <span className="block truncate text-[11px] text-slate-500">
                      {TIPO_DOCUMENTO_LABELS[doc.cdo_tipo] ?? doc.cdo_tipo} ·{' '}
                      {formatDate(doc.cdo_created_at.slice(0, 10))}
                    </span>
                  </span>
                </button>
                {canWrite && (
                  <IconButton
                    tone="rose"
                    onClick={() => requestDelete(doc.cdo_id)}
                    disabled={deletingId === doc.cdo_id}
                    aria-label={`Eliminar ${doc.cdo_nombre}`}
                    className="shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </IconButton>
                )}
              </div>
            ))}
          </div>
        )}
      </DocumentDropzone>

      {deleteError && (
        <Alert>
          <div>{deleteError}</div>
        </Alert>
      )}

      {pendingFile && (
        <Modal title="Guardar documento" onClose={() => setPendingFile(null)}>
          <form onSubmit={handleUploadSubmit} className="space-y-3" noValidate>
            {addError && (
              <Alert>
                <div>{addError}</div>
              </Alert>
            )}
            <p className="truncate text-xs text-slate-500">Archivo: {pendingFile.name}</p>
            <div>
              <span className={LABEL} id="cdo_tipo_label">
                Tipo de documento
              </span>
              {/* Pastillas y no un desplegable: cinco opciones fijas que se
                  eligen de un toque, sin abrir una lista. */}
              <div
                role="radiogroup"
                aria-labelledby="cdo_tipo_label"
                className="flex flex-wrap gap-1.5"
              >
                {TIPOS.map((t) => {
                  const checked = tipo === t
                  return (
                    <button
                      key={t}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      disabled={uploading}
                      onClick={() => setTipo(t)}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-xs font-semibold outline-none transition pointer-coarse:min-h-11 focus-visible:ring-2 focus-visible:ring-brand-500/60 active:scale-[0.97] motion-reduce:active:scale-100 disabled:cursor-not-allowed',
                        checked
                          ? 'border-brand-600 bg-brand-600 text-white shadow-sm'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                      )}
                    >
                      {TIPO_DOCUMENTO_LABELS[t]}
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <label className={LABEL} htmlFor="cdo_nombre">
                Nombre
              </label>
              <input
                id="cdo_nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                disabled={uploading}
                className={INPUT}
              />
              {nombre.trim().length > 0 && nombre.trim().length < 2 && (
                <p className={FIELD_ERROR}>El nombre debe tener al menos 2 caracteres.</p>
              )}
            </div>
            <Button type="submit" disabled={uploading} size="lg" block>
              {uploading ? (
                <>
                  <Loader2 className={SPINNER} /> Subiendo
                </>
              ) : (
                'Guardar documento'
              )}
            </Button>
          </form>
        </Modal>
      )}

      {confirmingId !== null && (
        <ConfirmDialog
          title="Eliminar documento"
          message="El archivo se borra definitivamente."
          onCancel={cancelDelete}
          onConfirm={handleConfirmDelete}
        />
      )}
    </div>
  )
}
