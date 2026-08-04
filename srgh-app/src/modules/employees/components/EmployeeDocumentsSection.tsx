'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AlertTriangle } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { DocumentDropzone } from '@/components/ui/DocumentDropzone'
import type {
  CatalogoItem,
  DocumentoEmpleado,
  DocumentoMetadataInput,
} from '@/modules/employees/types'
import { addEmployeeDocument } from '@/modules/employees/actions/addEmployeeDocument'
import { updateEmployeeDocument } from '@/modules/employees/actions/updateEmployeeDocument'
import { deleteEmployeeDocument } from '@/modules/employees/actions/deleteEmployeeDocument'
import { getEmployeeDocumentDownloadUrl } from '@/modules/employees/actions/getEmployeeDocumentDownloadUrl'
import { useCrudList } from '@/modules/employees/hooks/useCrudList'
import { formatDate, nombreSinExtension } from '@/modules/employees/lib/format'
import { DocumentMetadataForm } from './DocumentMetadataForm'
import { EmployeeDocumentsGrid, type DocumentoCardItem } from './EmployeeDocumentsGrid'

interface EmployeeDocumentsSectionProps {
  empId: number
  documentos: DocumentoEmpleado[]
  tiposDocumento: CatalogoItem[]
  canWrite: boolean
  listError?: string | null
}

/**
 * Sección "Documentos" del perfil de empleado (SGRH-67, fase 2B). Es un CRUD
 * SIEMPRE activo, independiente del modo edición de la ficha (mismo criterio
 * que la pestaña Usuarios): permisos propios (DOCUMENTOS_READ para ver la
 * sección, DOCUMENTOS_WRITE para subir/editar/eliminar), gated por el
 * padre — aquí solo se recibe `canWrite`.
 */
export function EmployeeDocumentsSection({
  empId,
  documentos,
  tiposDocumento,
  canWrite,
  listError,
}: EmployeeDocumentsSectionProps) {
  const router = useRouter()
  const {
    editing,
    setEditing,
    deletingId,
    confirmingId,
    deleteError,
    requestDelete,
    cancelDelete,
    confirmDelete,
  } = useCrudList<DocumentoEmpleado>((docId) => deleteEmployeeDocument(docId))

  const [cola, setCola] = useState<File[]>([])
  const [addError, setAddError] = useState<string | null>(null)
  const [editError, setEditError] = useState<string | null>(null)

  const editando = editing && editing !== 'new' ? editing : null
  const archivoEnCola = cola[0]

  async function handleAddSubmit(values: DocumentoMetadataInput) {
    if (!archivoEnCola) return
    setAddError(null)
    const formData = new FormData()
    formData.set('file', archivoEnCola)
    formData.set('doc_nombre', values.doc_nombre)
    formData.set('doc_tipo_id', String(values.doc_tipo_id))
    if (values.doc_descripcion) {
      formData.set('doc_descripcion', values.doc_descripcion)
    }
    if (values.doc_fecha_vencimiento) {
      formData.set('doc_fecha_vencimiento', values.doc_fecha_vencimiento)
    }
    const result = await addEmployeeDocument(empId, formData)
    if (!result.ok) {
      setAddError(result.error)
      return
    }
    toast.success('Documento agregado.')
    setCola((current) => current.slice(1))
    router.refresh()
  }

  function handleAddCancel() {
    setAddError(null)
    setCola((current) => current.slice(1))
  }

  async function handleEditSubmit(values: DocumentoMetadataInput) {
    if (!editando) return
    setEditError(null)
    const result = await updateEmployeeDocument(editando.doc_id, values)
    if (!result.ok) {
      setEditError(result.error)
      return
    }
    toast.success('Documento actualizado.')
    setEditing(null)
    router.refresh()
  }

  async function handleDownload(key: string) {
    const result = await getEmployeeDocumentDownloadUrl(Number(key))
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

  const items: DocumentoCardItem[] = documentos.map((doc) => ({
    key: String(doc.doc_id),
    nombre: doc.doc_nombre,
    tipoNombre: doc.tipo_nombre,
    mime: doc.doc_mime,
    descripcion: doc.doc_descripcion,
    fechaVencimiento: doc.doc_fecha_vencimiento,
    // doc_created_at es timestamptz ('2026-01-01T00:00:00Z'); formatDate parte
    // por '-' sin tocar Date, así que necesita solo la parte de la fecha.
    detalle: `Subido el ${formatDate(doc.doc_created_at.slice(0, 10))}`,
  }))

  return (
    <div className="space-y-3">
      {listError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />
          <div>{listError}</div>
        </div>
      )}

      {deleteError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />
          <div>{deleteError}</div>
        </div>
      )}

      {/* Sin header: el tab de la ficha ya dice "Documentos". */}
      <DocumentDropzone
        onSelect={(file) => setCola((current) => [...current, file])}
        disabled={!canWrite}
      >
        <EmployeeDocumentsGrid
          items={items}
          emptyMessage="Este empleado todavía no tiene documentos en su expediente."
          busyKey={deletingId !== null ? String(deletingId) : null}
          readOnly={!canWrite}
          onDownload={handleDownload}
          onEdit={(key) => {
            const doc = documentos.find((d) => String(d.doc_id) === key)
            if (doc) setEditing(doc)
          }}
          onDelete={(key) => requestDelete(Number(key))}
        />
      </DocumentDropzone>

      {archivoEnCola && (
        <Modal title="Datos del documento" subtitle={archivoEnCola.name} onClose={handleAddCancel}>
          <DocumentMetadataForm
            tiposDocumento={tiposDocumento}
            defaultValues={{ doc_nombre: nombreSinExtension(archivoEnCola.name) }}
            serverError={addError}
            onCancel={handleAddCancel}
            onSubmit={handleAddSubmit}
          />
        </Modal>
      )}

      {editando && (
        <Modal
          title="Editar documento"
          subtitle={editando.doc_nombre}
          onClose={() => setEditing(null)}
        >
          <DocumentMetadataForm
            key={editando.doc_id}
            tiposDocumento={tiposDocumento}
            defaultValues={{
              doc_nombre: editando.doc_nombre,
              doc_tipo_id: editando.doc_tipo_id,
              doc_descripcion: editando.doc_descripcion,
              doc_fecha_vencimiento: editando.doc_fecha_vencimiento,
            }}
            serverError={editError}
            submitLabel="Actualizar"
            onCancel={() => setEditing(null)}
            onSubmit={handleEditSubmit}
          />
        </Modal>
      )}

      {confirmingId !== null && (
        <ConfirmDialog
          title="Eliminar documento"
          message="El documento se eliminará definitivamente del expediente. Esta acción no se puede deshacer."
          onCancel={cancelDelete}
          onConfirm={handleConfirmDelete}
        />
      )}
    </div>
  )
}
