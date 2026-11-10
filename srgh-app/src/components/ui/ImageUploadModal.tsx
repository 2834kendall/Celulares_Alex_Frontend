'use client'

import { useState } from 'react'
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Modal } from '@/components/ui/Modal'
import { PhotoDropzone } from '@/components/ui/PhotoDropzone'
import { Button } from '@/components/ui/Button'
import { SPINNER } from '@/components/ui/styles'
import { isNextNavigation } from '@/lib/utils/isNextNavigation'

type ActionResult = { ok: true } | { ok: false; error: string }

interface ImageUploadModalProps {
  title: string
  /** Imagen ya guardada (URL firmada), o null si no hay. */
  currentUrl: string | null
  onClose: () => void
  /** Sube y asigna la imagen elegida (la Server Action recibe el FormData). */
  onSave: (formData: FormData) => Promise<ActionResult>
  /** Quita la imagen guardada. */
  onRemove: () => Promise<ActionResult>
  /** Props del área de arrastre: qué contenedor valida y con qué forma. */
  dropzone?: Pick<React.ComponentProps<typeof PhotoDropzone>, 'container' | 'shape' | 'label'>
  /** Textos que cambian según qué imagen sea. */
  copy: {
    saved: string
    removed: string
    removeAction: string
    removeConfirmTitle: string
    removeConfirmMessage: string
  }
}

/**
 * Modal para subir, reemplazar o quitar una imagen (foto de empleado, logo de
 * la empresa). Elegir o arrastrar deja el archivo en memoria con preview
 * hasta confirmar con "Guardar": nada se sube al elegir. La validación real
 * (magic bytes, tamaño) la repite el servidor; el dropzone solo adelanta el
 * error.
 */
export function ImageUploadModal({
  title,
  currentUrl,
  onClose,
  onSave,
  onRemove,
  dropzone,
  copy,
}: ImageUploadModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const busy = saving || removing
  const guard = useUnsavedChanges({
    label: title.toLocaleLowerCase(),
    value: file,
    hasFiles: Boolean(file),
    busy,
  })

  async function handleSave() {
    if (!file) {
      return
    }
    setError(null)
    setSaving(true)
    const formData = new FormData()
    formData.set('file', file)
    let result: ActionResult
    try {
      result = await onSave(formData)
    } catch (e) {
      if (!isNextNavigation(e)) {
        setError(
          'No se pudo confirmar el guardado. Revisá la conexión y reintentá; la imagen sigue seleccionada.'
        )
      }
      return
    } finally {
      // Con `busy` en true, el aviso de cambios no deja salir: si no se libera en
      // todos los caminos, el modal queda trabado hasta recargar.
      setSaving(false)
    }
    if (!result.ok) {
      setError(result.error)
      return
    }
    toast.success(copy.saved)
    guard.acceptChanges()
    onClose()
  }

  async function handleRemove() {
    setError(null)
    setRemoving(true)
    let result: ActionResult
    try {
      result = await onRemove()
    } catch (e) {
      if (!isNextNavigation(e)) {
        setError('No se pudo confirmar el cambio. Revisá la conexión y reintentá.')
      }
      return
    } finally {
      setRemoving(false)
      setConfirmRemove(false)
    }
    if (!result.ok) {
      setError(result.error)
      return
    }
    toast.success(copy.removed)
    guard.acceptChanges()
    onClose()
  }

  return (
    <>
      <Modal title={title} onClose={onClose}>
        <div
          ref={(element) => guard.bindRoot(element)}
          className="flex flex-col items-center gap-3"
        >
          <PhotoDropzone
            file={file}
            currentUrl={currentUrl}
            onSelect={setFile}
            onClear={() => setFile(null)}
            disabled={busy}
            {...dropzone}
          />

          {error && (
            <p role="alert" className="text-xs text-rose-600">
              {error}
            </p>
          )}

          <div className="mt-1 flex w-full items-center justify-between gap-2">
            {currentUrl && !file ? (
              <button
                type="button"
                onClick={() => setConfirmRemove(true)}
                disabled={busy}
                className="text-xs font-medium text-rose-600 outline-none transition hover:underline disabled:opacity-50"
              >
                {copy.removeAction}
              </button>
            ) : (
              <span />
            )}

            <div className="flex items-center gap-2">
              <Button
                onClick={() => guard.confirmLeave(onClose)}
                disabled={busy}
                variant="secondary"
                size="md"
              >
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={!file || busy} size="md">
                {saving && <Loader2 className={SPINNER} />}
                Guardar
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {confirmRemove && (
        <ConfirmDialog
          title={copy.removeConfirmTitle}
          message={copy.removeConfirmMessage}
          confirmLabel="Quitar"
          onCancel={() => setConfirmRemove(false)}
          onConfirm={handleRemove}
        />
      )}
    </>
  )
}
