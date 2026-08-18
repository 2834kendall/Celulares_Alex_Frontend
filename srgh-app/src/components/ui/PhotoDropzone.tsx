'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { validateUpload } from '@/lib/storage/validation'
import { uploadValidationMessage } from '@/modules/storage/lib/storageErrors'

interface PhotoDropzoneProps {
  /** Archivo elegido pero aún no subido — lo controla el padre (fuera de RHF). */
  file: File | null
  /** Foto YA guardada (URL firmada): se muestra si no hay `file` nuevo. */
  currentUrl?: string | null
  onSelect: (file: File) => void
  /** Cancela la selección local (NO borra una foto ya guardada). */
  onClear: () => void
  disabled?: boolean
  className?: string
}

const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp'

/**
 * Uploader de foto reutilizado por el wizard de alta y el detalle de
 * empleado (SGRH-67). Pre-valida por magic bytes en el navegador con el
 * MISMO `validateUpload` que usa el servidor — error instantáneo sin
 * round-trip, pero el servidor sigue siendo la autoridad: esto es solo UX.
 */
export function PhotoDropzone({
  file,
  currentUrl,
  onSelect,
  onClear,
  disabled = false,
  className = '',
}: PhotoDropzoneProps) {
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // El preview se DERIVA de `file` en el propio render (no en un efecto): el
  // efecto de abajo solo existe para el cleanup del object URL, nunca para
  // setear estado — createObjectURL es barato y determinista por archivo.
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])

  // El object URL del preview solo vive mientras exista `file` local; se
  // revoca al cambiar o desmontar para no filtrar memoria.
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  async function validateAndSelect(candidate: File) {
    setError(null)
    const bytes = new Uint8Array(await candidate.arrayBuffer())
    const result = validateUpload(bytes, 'FOTOS_EMPLEADO')
    if (!result.ok) {
      setError(uploadValidationMessage(result.error, 'FOTOS_EMPLEADO'))
      return
    }
    onSelect(candidate)
  }

  function onInputChange(fileList: FileList | null) {
    const candidate = fileList?.[0]
    if (candidate) {
      void validateAndSelect(candidate)
    }
    // Permite volver a elegir el mismo archivo tras un error.
    if (inputRef.current) {
      inputRef.current.value = ''
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    if (disabled) {
      return
    }
    const candidate = e.dataTransfer.files?.[0]
    if (candidate) {
      void validateAndSelect(candidate)
    }
  }

  function openPicker() {
    if (!disabled) {
      inputRef.current?.click()
    }
  }

  const displayUrl = previewUrl ?? currentUrl ?? null

  return (
    <div className={className}>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        className="hidden"
        data-testid="photo-dropzone-input"
        disabled={disabled}
        onChange={(e) => onInputChange(e.target.files)}
      />

      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-label="Subir foto del colaborador"
        onClick={openPicker}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            openPicker()
          }
        }}
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) {
            setDragging(true)
          }
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border-2 border-dashed outline-none transition ${
          dragging
            ? 'border-brand-500 bg-brand-50'
            : 'border-slate-300 bg-slate-50 hover:border-slate-400'
        } ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
      >
        {displayUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- object URL local o URL firmada, no un asset del build.
          <img
            src={displayUrl}
            alt="Vista previa de la foto"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-1 px-2 text-center text-slate-400">
            <ImagePlus className="h-6 w-6" />
            <span className="text-[10px] leading-tight">Arrastrá o hacé click</span>
          </div>
        )}
      </div>

      {file && !disabled && (
        <button
          type="button"
          onClick={onClear}
          className="mt-2 flex items-center gap-1 text-[11px] font-medium text-slate-500 outline-none transition hover:text-rose-600 focus-visible:underline"
        >
          <X className="h-3 w-3" />
          Quitar selección
        </button>
      )}

      {error && <p className="mt-1 text-[11px] text-rose-600">{error}</p>}
    </div>
  )
}
