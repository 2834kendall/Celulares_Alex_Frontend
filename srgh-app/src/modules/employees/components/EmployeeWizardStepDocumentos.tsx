'use client'

import { useState } from 'react'
import { Info } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { DocumentDropzone } from '@/components/ui/DocumentDropzone'
import type {
  CatalogoItem,
  DocumentoMetadataInput,
  DocumentoPendiente,
} from '@/modules/employees/types'
import { nombreSinExtension } from '@/modules/employees/lib/format'
import { DocumentMetadataForm } from './DocumentMetadataForm'
import { EmployeeDocumentsGrid, type DocumentoCardItem } from './EmployeeDocumentsGrid'

interface EmployeeWizardStepDocumentosProps {
  tiposDocumento: CatalogoItem[]
  documentos: DocumentoPendiente[]
  onChange: (documentos: DocumentoPendiente[]) => void
  canManageDocs: boolean
}

/**
 * Paso 4 del onboarding (opcional): documentos del expediente. A diferencia
 * de la foto, aquí puede haber VARIOS archivos, cada uno con su propia
 * metadata — se capturan en cola: cada archivo agregado abre el modal de
 * metadata antes de pasar al siguiente. Nada se sube todavía: los
 * documentos viajan en memoria (DocumentoPendiente[]) y EmployeeWizard los
 * sube uno por uno DESPUÉS de crear el empleado (mismo criterio que la
 * foto — nunca bloquean el alta).
 */
export function EmployeeWizardStepDocumentos({
  tiposDocumento,
  documentos,
  onChange,
  canManageDocs,
}: EmployeeWizardStepDocumentosProps) {
  const [cola, setCola] = useState<File[]>([])
  const [editandoKey, setEditandoKey] = useState<string | null>(null)

  function handleFileSelect(file: File) {
    setCola((current) => [...current, file])
  }

  function handleNuevoSubmit(values: DocumentoMetadataInput) {
    const archivo = cola[0]
    if (!archivo) return
    onChange([...documentos, { key: crypto.randomUUID(), file: archivo, metadata: values }])
    setCola((current) => current.slice(1))
  }

  function handleNuevoCancel() {
    setCola((current) => current.slice(1))
  }

  function handleEditarSubmit(values: DocumentoMetadataInput) {
    onChange(
      documentos.map((doc) => (doc.key === editandoKey ? { ...doc, metadata: values } : doc))
    )
    setEditandoKey(null)
  }

  function handleDelete(key: string) {
    onChange(documentos.filter((doc) => doc.key !== key))
  }

  const items: DocumentoCardItem[] = documentos.map((doc) => ({
    key: doc.key,
    nombre: doc.metadata.doc_nombre,
    tipoNombre:
      tiposDocumento.find((tipo) => tipo.id === doc.metadata.doc_tipo_id)?.nombre ?? 'Otro',
    mime: doc.file.type,
    descripcion: doc.metadata.doc_descripcion ?? null,
    fechaVencimiento: doc.metadata.doc_fecha_vencimiento ?? null,
    // Todavía no existe el empleado: estos documentos se suben al crearlo.
    detalle: 'Pendiente de subir',
  }))

  const editando = editandoKey ? documentos.find((doc) => doc.key === editandoKey) : undefined
  const archivoEnCola = cola[0]

  const encabezado = (
    <div>
      <h2 className="text-xs font-bold uppercase tracking-wide text-slate-600">
        Documentos del expediente
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        Adjunta los documentos del colaborador. Este paso es opcional: también puedes agregarlos
        después desde su perfil.
      </p>
    </div>
  )

  return (
    <div className="space-y-4">
      {!canManageDocs ? (
        <>
          {encabezado}
          <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <p>Tu rol no tiene permiso de gestión de documentos. Continúa al siguiente paso.</p>
          </div>
        </>
      ) : (
        <DocumentDropzone header={encabezado} onSelect={handleFileSelect}>
          <EmployeeDocumentsGrid
            items={items}
            emptyMessage="Todavía no agregaste documentos."
            onEdit={setEditandoKey}
            onDelete={handleDelete}
          />
        </DocumentDropzone>
      )}

      {archivoEnCola && (
        <Modal
          title="Datos del documento"
          subtitle={archivoEnCola.name}
          onClose={handleNuevoCancel}
        >
          <DocumentMetadataForm
            tiposDocumento={tiposDocumento}
            defaultValues={{ doc_nombre: nombreSinExtension(archivoEnCola.name) }}
            onCancel={handleNuevoCancel}
            onSubmit={handleNuevoSubmit}
          />
        </Modal>
      )}

      {editando && (
        <Modal
          title="Editar documento"
          subtitle={editando.metadata.doc_nombre}
          onClose={() => setEditandoKey(null)}
        >
          <DocumentMetadataForm
            key={editando.key}
            tiposDocumento={tiposDocumento}
            defaultValues={editando.metadata}
            submitLabel="Actualizar"
            onCancel={() => setEditandoKey(null)}
            onSubmit={handleEditarSubmit}
          />
        </Modal>
      )}
    </div>
  )
}
