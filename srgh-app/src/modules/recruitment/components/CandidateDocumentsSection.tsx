'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Loader2, Trash2 } from 'lucide-react'
import { DocumentDropzone } from '@/components/ui/DocumentDropzone'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Modal } from '@/components/ui/Modal'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { FIELD_ERROR, INPUT, LABEL, SELECT, SPINNER } from '@/components/ui/styles'
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

    setPendingFile(null)
    router.refresh()
  }

  async function handleDownload(docId: number) {
    setDownloadingId(docId)
    const result = await getCandidateDocumentDownloadUrl(docId)
    setDownloadingId(null)
    if (result.ok) {
      window.open(result.url, '_blank', 'noopener,noreferrer')
    }
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
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <FileText className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => handleDownload(doc.cdo_id)}
                    disabled={downloadingId === doc.cdo_id}
                    className="block truncate text-left text-xs font-semibold text-brand-700 outline-none hover:underline disabled:opacity-50"
                  >
                    {doc.cdo_nombre}
                  </button>
                  <p className="truncate text-[11px] text-slate-500">
                    {TIPO_DOCUMENTO_LABELS[doc.cdo_tipo] ?? doc.cdo_tipo} ·{' '}
                    {formatDate(doc.cdo_created_at.slice(0, 10))}
                  </p>
                </div>
                {canWrite && (
                  <button
                    type="button"
                    onClick={() => requestDelete(doc.cdo_id)}
                    disabled={deletingId === doc.cdo_id}
                    aria-label={`Eliminar ${doc.cdo_nombre}`}
                    className="shrink-0 rounded-lg p-1.5 text-rose-500 outline-none transition hover:bg-rose-50 focus-visible:ring-2 focus-visible:ring-rose-500/60 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
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
              <label className={LABEL} htmlFor="cdo_tipo">
                Tipo de documento
              </label>
              <select
                id="cdo_tipo"
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                disabled={uploading}
                className={SELECT}
              >
                {TIPOS.map((t) => (
                  <option key={t} value={t}>
                    {TIPO_DOCUMENTO_LABELS[t]}
                  </option>
                ))}
              </select>
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
          onConfirm={confirmDelete}
        />
      )}
    </div>
  )
}
