'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Modal } from '@/components/ui/Modal'
import { PhotoDropzone } from '@/components/ui/PhotoDropzone'
import { removeEmployeePhoto } from '@/modules/employees/actions/removeEmployeePhoto'
import { setEmployeePhoto } from '@/modules/employees/actions/setEmployeePhoto'

interface EmployeePhotoModalProps {
  empId: number
  currentUrl: string | null
  onClose: () => void
}

/**
 * Modal de edición de foto del detalle de empleado (SGRH-67). Reusa el MISMO
 * PhotoDropzone del wizard de alta: elegir/arrastrar deja el archivo en
 * memoria (preview) hasta confirmar con "Guardar" — nada se sube al elegir.
 */
export function EmployeePhotoModal({ empId, currentUrl, onClose }: EmployeePhotoModalProps) {
  const router = useRouter()
  const [foto, setFoto] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const busy = saving || removing

  async function handleSave() {
    if (!foto) {
      return
    }
    setError(null)
    setSaving(true)
    const formData = new FormData()
    formData.set('file', foto)
    const result = await setEmployeePhoto(empId, formData)
    setSaving(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    toast.success('Foto actualizada.')
    router.refresh()
    onClose()
  }

  async function handleRemove() {
    setError(null)
    setRemoving(true)
    const result = await removeEmployeePhoto(empId)
    setRemoving(false)
    setConfirmRemove(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    toast.success('Foto eliminada.')
    router.refresh()
    onClose()
  }

  return (
    <>
      <Modal title="Foto del colaborador" onClose={onClose}>
        <div className="flex flex-col items-center gap-3">
          <PhotoDropzone
            file={foto}
            currentUrl={currentUrl}
            onSelect={setFoto}
            onClear={() => setFoto(null)}
            disabled={busy}
          />

          {error && (
            <p role="alert" className="text-xs text-rose-600">
              {error}
            </p>
          )}

          <div className="mt-1 flex w-full items-center justify-between gap-2">
            {currentUrl && !foto ? (
              <button
                type="button"
                onClick={() => setConfirmRemove(true)}
                disabled={busy}
                className="text-xs font-medium text-rose-600 outline-none transition hover:underline disabled:opacity-50"
              >
                Quitar foto
              </button>
            ) : (
              <span />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-500/60 disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!foto || busy}
                className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm outline-none transition hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Guardar
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {confirmRemove && (
        <ConfirmDialog
          title="¿Quitar la foto?"
          message="El colaborador volverá a mostrar sus iniciales en vez de la foto."
          confirmLabel="Quitar"
          onCancel={() => setConfirmRemove(false)}
          onConfirm={handleRemove}
        />
      )}
    </>
  )
}
