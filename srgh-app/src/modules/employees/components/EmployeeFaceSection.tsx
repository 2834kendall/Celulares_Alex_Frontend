'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Glasses, Hand, ScanFace, Sun, Trash2, UserRound, type LucideIcon } from 'lucide-react'
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
// Los modelos pesados (MediaPipe, face-api, onnxruntime) entran por import()
// dinamico dentro de FaceScan; se precargan al abrir la pestaña (ver abajo).
import { FaceScan, preloadFaceScan } from '@/modules/attendance/components/kiosk/face/FaceScan'
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
 * Lo que tiene que hacer la persona; se muestra antes de abrir la cámara.
 * Ícono y dos o tres palabras: se lee de un vistazo, sin párrafos. El detalle
 * (qué cuenta como "tapada", qué hacer si falla) lo da la franja de la cámara
 * en el momento, cuando de verdad hace falta.
 */
const GUIDE: { icon: LucideIcon; label: string }[] = [
  { icon: UserRound, label: 'De frente' },
  { icon: Hand, label: 'Sin nada en la cara' },
  { icon: Sun, label: 'Buena luz' },
  { icon: Glasses, label: 'Lentes claros, sí' },
]

type Step = 'idle' | 'guide' | 'scanning'

/**
 * Tab Rostro del perfil (SGRH-102): registrar, reemplazar o eliminar el rostro
 * con el que el kiosco reconoce al colaborador. Es el único punto de entrada
 * del enrolamiento: lo normal es hacerlo al incorporar a alguien, desde la
 * computadora de quien lo da de alta.
 *
 * La captura usa la MISMA prueba de vida que el kiosco (SGRH-80): un vector
 * registrado desde una fotografía no caduca y deja al colaborador suplantable
 * de forma permanente.
 *
 * Guía (SGRH-117): antes de abrir la cámara se explica qué tiene que hacer la
 * persona, y mientras se lee ya se bajan los modelos. La captura se guarda
 * sola cuando FaceScan valida la cara; en el registro también rechaza una mano
 * sobre el rostro.
 */
export function EmployeeFaceSection({
  empId,
  status,
  error,
  hasActiveContract,
}: EmployeeFaceSectionProps) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('idle')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)

  // Los modelos pesan ~20 MB la primera vez. Se empiezan a bajar apenas se
  // abre la pestaña, cuando el navegador queda libre, para que al tocar
  // "Capturar rostro" ya estén (o casi). Solo si de verdad se puede capturar.
  const canCapture = status !== null && hasActiveContract
  useEffect(() => {
    if (!canCapture) return
    const preload = () => preloadFaceScan(true)
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(preload, { timeout: 2000 })
      return () => window.cancelIdleCallback(id)
    }
    const timer = window.setTimeout(preload, 500)
    return () => window.clearTimeout(timer)
  }, [canCapture])

  function openGuide() {
    preloadFaceScan(true)
    setStep('guide')
  }

  const handleEmbedding = useCallback(
    async (payload: EncryptedVector) => {
      if (savingRef.current) return
      savingRef.current = true
      setSaving(true)
      try {
        const result = await enrollFace({ employeeId: empId, vector: payload })
        if (!result.ok) {
          toast.error(result.error)
          return
        }
        toast.success('Rostro registrado.')
        // enrollFace no revalida la ruta: el estado del registro se relee acá.
        router.refresh()
      } catch {
        toast.error('No se pudo guardar el rostro. Revisá la conexión e intentá de nuevo.')
      } finally {
        savingRef.current = false
        setSaving(false)
        setStep('idle')
      }
    },
    [empId, router]
  )

  const handleUnavailable = useCallback((reason: string) => {
    toast.error(reason)
    setStep('idle')
  }, [])

  const handleSpoof = useCallback(() => {
    toast.error(
      'La cámara ve una imagen plana, no un rostro. El registro debe hacerse con la persona presente.'
    )
    setStep('idle')
  }, [])

  async function handleConfirmDelete() {
    setConfirmingDelete(false)
    setDeleting(true)
    try {
      const result = await deleteFaceEnrollment(empId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Registro facial eliminado.')
    } catch {
      toast.error('No se pudo eliminar el rostro. Revisá la conexión e intentá de nuevo.')
    } finally {
      setDeleting(false)
    }
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

        {step === 'guide' && (
          <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-semibold text-slate-900">Antes de capturar</h3>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {GUIDE.map(({ icon: Icon, label }) => (
                <li
                  key={label}
                  className="flex flex-col items-center gap-2 rounded-lg bg-white px-2 py-3 text-center ring-1 ring-slate-200"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="text-sm font-medium text-slate-800">{label}</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setStep('scanning')}>
                <ScanFace className="h-3.5 w-3.5" aria-hidden="true" />
                Empezar captura
              </Button>
              <Button variant="secondary" onClick={() => setStep('idle')}>
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {step === 'scanning' && (
          <div className="flex flex-col items-center gap-3">
            <FaceScan
              enrollment
              onEmbedding={handleEmbedding}
              onUnavailable={handleUnavailable}
              onSpoof={handleSpoof}
            />
            {saving && (
              <p role="status" className="text-sm text-slate-600">
                Guardando registro facial…
              </p>
            )}
            <Button
              variant="secondary"
              disabled={saving}
              onClick={() => {
                if (!savingRef.current) setStep('idle')
              }}
            >
              Cancelar
            </Button>
          </div>
        )}

        {step === 'idle' && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant={necesitaCaptura ? 'primary' : 'secondary'}
              onClick={openGuide}
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
