'use client'

import { ImageUploadModal } from '@/components/ui/ImageUploadModal'
import { removeEmployeePhoto } from '@/modules/employees/actions/removeEmployeePhoto'
import { setEmployeePhoto } from '@/modules/employees/actions/setEmployeePhoto'

interface EmployeePhotoModalProps {
  empId: number
  currentUrl: string | null
  onClose: () => void
}

/**
 * Modal de edición de foto del detalle de empleado (SGRH-67). La mecánica
 * (preview, guardar, quitar con confirmación) es la de ImageUploadModal,
 * compartida con el logo de la empresa.
 */
export function EmployeePhotoModal({ empId, currentUrl, onClose }: EmployeePhotoModalProps) {
  return (
    <ImageUploadModal
      title="Foto del colaborador"
      currentUrl={currentUrl}
      onClose={onClose}
      onSave={(formData) => setEmployeePhoto(empId, formData)}
      onRemove={() => removeEmployeePhoto(empId)}
      copy={{
        saved: 'Foto actualizada.',
        removed: 'Foto eliminada.',
        removeAction: 'Quitar foto',
        removeConfirmTitle: '¿Quitar la foto?',
        removeConfirmMessage: 'El colaborador volverá a mostrar sus iniciales en vez de la foto.',
      }}
    />
  )
}
