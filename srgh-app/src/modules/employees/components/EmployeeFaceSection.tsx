'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ScanFace, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { SectionCard } from '@/components/ui/ProfileSection'
import { enrollFace } from '@/modules/attendance/actions/enrollFace'
import { deleteFaceEnrollment } from '@/modules/attendance/actions/deleteFaceEnrollment'
import type { FaceStatus } from '@/modules/attendance/actions/getFaceStatus'
import type { EncryptedVector } from '@/modules/attendance/lib/face/faceCrypto'
// Los modelos pesados (MediaPipe, face-api, onnxruntime) ya entran por
// import() dinamico dentro de FaceScan: hasta que se pulsa "Capturar" no se
// descarga nada de eso.
import { FaceScan } from '@/modules/attendance/components/kiosk/face/FaceScan'
import { formatDate } from '@/modules/employees/lib/format'

interface EmployeeFaceSectionProps {
  empId: number
  /** null si no se pudo cargar: la sección muestra `error` y no ofrece acciones. */
  status: FaceStatus | null
  error: string | null
  /** Sin contrato vigente enrollFace rechaza la captura; borrar sí se permite. */
  hasActiveContract: boolean
}

/**
 * Tab Rostro del perfil (SGRH-102): registrar, reemplazar o eliminar el rostro
 * con el que el kiosco reconoce al colaborador. Es el único punto de entrada
 * del enrolamiento: lo normal es hacerlo al incorporar a alguien, desde la
 * computadora de quien lo da de alta.
 *
 * La captura usa la MISMA prueba de vida que el kiosco (SGRH-80): un vector
 * registrado desde una fotografía no caduca y deja al colaborador suplantable
 * de forma permanente.
 */
export function EmployeeFaceSection({
  empId,
  status,
  error,
  hasActiveContract,
}: EmployeeFaceSectionProps) {
  const router = useRouter()
  const [scanning, setScanning] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleEmbedding = useCallback(
    async (payload: EncryptedVector) => {
      const result = await enrollFace({ employeeId: empId, vector: payload })
      setScanning(false)

      if (!result.ok) {
        toast.error(result.error)
        return
      }

      toast.success('Rostro registrado.')
      // enrollFace no revalida: el estado de la sección viene del servidor.
      router.refresh()
    },
    [empId, router]
  )

  const handleUnavailable = useCallback((reason: string) => {
    toast.error(reason)
    setScanning(false)
  }, [])

  const handleSpoof = useCallback(() => {
    toast.error(
      'La cámara ve una imagen plana, no un rostro. El registro debe hacerse con la persona presente.'
    )
    setScanning(false)
  }, [])

  async function handleConfirmDelete() {
    setConfirmingDelete(false)
    setDeleting(true)
    const result = await deleteFaceEnrollment(empId)
    setDeleting(false)

    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success('Registro facial eliminado.')
  }

  if (status === null) {
    return (
      <SectionCard title="Reconocimiento facial">
        <Alert>{error ?? 'No se pudo cargar el registro facial.'}</Alert>
      </SectionCard>
    )
  }

  const necesitaCaptura = !status.enrolled || !status.currentModel

  return (
    <SectionCard
      title="Reconocimiento facial"
      action={
        status.enrolled ? (
          status.currentModel ? (
            <Badge tone="emerald">Registrado</Badge>
          ) : (
            <Badge tone="amber">Requiere nueva captura</Badge>
          )
        ) : (
          <Badge tone="slate">Sin registro</Badge>
        )
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          {!status.enrolled
            ? 'El kiosco no puede reconocer a esta persona hasta que se registre su rostro.'
            : status.currentModel
              ? `Última captura: ${formatDate(status.updatedAt.slice(0, 10))}. Capturar de nuevo reemplaza el registro actual.`
              : 'El registro es de una versión anterior del reconocimiento y el kiosco ya no lo usa. Hay que capturar el rostro de nuevo.'}
        </p>

        {!hasActiveContract && (
          <Alert tone="info">
            Solo se puede registrar el rostro de un colaborador con contrato vigente.
          </Alert>
        )}

        {scanning ? (
          <div className="flex flex-col items-center gap-3">
            <FaceScan
              enrollment
              onEmbedding={handleEmbedding}
              onUnavailable={handleUnavailable}
              onSpoof={handleSpoof}
            />
            <Button variant="secondary" onClick={() => setScanning(false)}>
              Cancelar
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              variant={necesitaCaptura ? 'primary' : 'secondary'}
              onClick={() => setScanning(true)}
              disabled={!hasActiveContract || deleting}
            >
              <ScanFace className="h-3.5 w-3.5" aria-hidden="true" />
              {!status.enrolled
                ? 'Capturar rostro'
                : status.currentModel
                  ? 'Reemplazar'
                  : 'Capturar de nuevo'}
            </Button>
            {status.enrolled && (
              <Button
                variant="secondary"
                onClick={() => setConfirmingDelete(true)}
                disabled={deleting}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                {deleting ? 'Eliminando…' : 'Eliminar registro'}
              </Button>
            )}
          </div>
        )}
      </div>

      {confirmingDelete && (
        <ConfirmDialog
          title="Eliminar registro facial"
          message="El kiosco dejará de reconocer a esta persona hasta que se registre su rostro de nuevo."
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={handleConfirmDelete}
        />
      )}
    </SectionCard>
  )
}
