'use client'

import { useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { validateUpload } from '@/lib/storage/validation'
import { uploadValidationMessage } from '@/modules/storage/lib/storageErrors'

interface DocumentDropzoneProps {
  onSelect: (file: File) => void
  /** La grilla de documentos: es también el área donde se sueltan archivos. */
  children: React.ReactNode
  /** Bloque izquierdo de la fila superior (el wizard pasa ahí su título). */
  header?: React.ReactNode
  triggerLabel?: string
  /** Sin permiso de escritura: sin botón y sin drag & drop (la grilla sigue). */
  disabled?: boolean
  className?: string
}

const ACCEPTED_TYPES = 'application/pdf,image/jpeg,image/png'

interface FileError {
  name: string
  message: string
}

/**
 * Contenedor de subida de documentos (SGRH-67): botón "Nuevo" arriba y área
 * de arrastre que envuelve la grilla, en vez de una zona punteada fija que
 * ocupaba espacio permanentemente.
 *
 * Igual que PhotoDropzone, pre-valida por magic bytes en el navegador con el
 * MISMO `validateUpload` que usa el servidor — error instantáneo sin
 * round-trip; el servidor sigue siendo la autoridad. Cada archivo válido
 * dispara `onSelect` de inmediato: el padre decide qué hacer con cada uno
 * (abrir el modal de metadata).
 */
export function DocumentDropzone({
  onSelect,
  children,
  header,
  triggerLabel = 'Nuevo documento',
  disabled = false,
  className = '',
}: DocumentDropzoneProps) {
  const [dragging, setDragging] = useState(false)
  const [errors, setErrors] = useState<FileError[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  async function validateAndSelect(files: File[]) {
    const newErrors: FileError[] = []

    for (const file of files) {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const result = validateUpload(bytes, 'DOCUMENTOS_EMPLEADO')
      if (!result.ok) {
        newErrors.push({
          name: file.name,
          message: uploadValidationMessage(result.error, 'DOCUMENTOS_EMPLEADO'),
        })
        continue
      }
      onSelect(file)
    }

    setErrors(newErrors)
  }

  function onInputChange(fileList: FileList | null) {
    const files = fileList ? Array.from(fileList) : []
    if (files.length > 0) {
      void validateAndSelect(files)
    }
    // Permite volver a elegir los mismos archivos tras un error.
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
    const files = Array.from(e.dataTransfer.files ?? [])
    if (files.length > 0) {
      void validateAndSelect(files)
    }
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_TYPES}
        className="hidden"
        data-testid="document-dropzone-input"
        disabled={disabled}
        onChange={(e) => onInputChange(e.target.files)}
      />

      {(header || !disabled) && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">{header}</div>
          {!disabled && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm outline-none transition hover:bg-brand-700 focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 active:scale-[0.98]"
            >
              <Plus className="h-3.5 w-3.5" /> {triggerLabel}
            </button>
          )}
        </div>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) {
            setDragging(true)
          }
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`rounded-xl transition ${dragging ? 'bg-brand-50/60 ring-2 ring-brand-500' : ''}`}
      >
        {children}
      </div>

      {errors.length > 0 && (
        <ul className="space-y-0.5">
          {errors.map((error) => (
            <li key={error.name} className="text-[11px] text-rose-600">
              «{error.name}»: {error.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
