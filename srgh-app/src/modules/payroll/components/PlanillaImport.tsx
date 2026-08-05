'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, FileDown, FileUp, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { uploadPlanilla } from '@/modules/payroll/actions/uploadPlanilla'

interface PlanillaImportProps {
  periodoId: number
  estado: string
}

/**
 * Descarga de la plantilla Excel del periodo y subida de la planilla llena.
 * Solo se renderiza para usuarios con NOMINA_WRITE; la subida se bloquea
 * fuera del estado borrador (el servidor lo re-verifica de todas formas).
 */
export function PlanillaImport({ periodoId, estado }: PlanillaImportProps) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isDownloading, setIsDownloading] = useState(false)

  const esBorrador = estado === 'borrador'

  /**
   * Fetch en vez de <a href>: si el servidor responde con un error (p. ej.
   * "sucursal sin empleados activos"), un link directo navegaría a la URL y
   * mostraría el JSON crudo en pantalla. Con fetch podemos mostrar el error
   * en el mismo banner que el resto del módulo.
   */
  const onDownload = async () => {
    setError(null)
    setIsDownloading(true)

    try {
      const response = await fetch(`/api/payroll/${periodoId}/template`)

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null
        setError(body?.error ?? 'No se pudo descargar la plantilla.')
        return
      }

      const disposition = response.headers.get('Content-Disposition') ?? ''
      const filenameMatch = /filename="([^"]+)"/.exec(disposition)
      const filename = filenameMatch?.[1] ?? `planilla-${periodoId}.xlsx`

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('No se pudo descargar la plantilla. Revisa tu conexión e intenta de nuevo.')
    } finally {
      setIsDownloading(false)
    }
  }

  const onFileSelected = (file: File | undefined) => {
    if (!file) return
    setError(null)

    const formData = new FormData()
    formData.set('periodoId', String(periodoId))
    formData.set('file', file)

    startTransition(async () => {
      const result = await uploadPlanilla(formData)
      if (inputRef.current) inputRef.current.value = ''

      if (!result.ok) {
        setError(result.error)
        return
      }

      const partes = [
        result.nuevos > 0 && `${result.nuevos} nuevo(s)`,
        result.actualizados > 0 && `${result.actualizados} actualizado(s)`,
        result.sinCambios > 0 && `${result.sinCambios} sin cambios`,
        result.eliminados > 0 && `${result.eliminados} eliminado(s)`,
      ].filter((parte): parte is string => Boolean(parte))

      toast.success(
        `Planilla guardada: ${result.empleados} empleado(s)${
          partes.length > 0 ? ` (${partes.join(', ')})` : ''
        }.`
      )
      router.refresh()
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">Planilla en Excel</p>
          <p className="text-xs text-slate-500">
            Descarga la plantilla con los empleados de la sucursal, llena los montos y súbela.
            {!esBorrador && ' Este periodo ya no está en borrador: la subida está deshabilitada.'}
          </p>
        </div>

        <button
          type="button"
          onClick={onDownload}
          disabled={isDownloading}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm outline-none transition hover:border-blue-300 hover:text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {isDownloading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FileDown className="h-3.5 w-3.5" />
          )}
          {isDownloading ? 'Descargando…' : 'Descargar plantilla'}
        </button>

        <label
          className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow-sm outline-none transition focus-within:ring-2 focus-within:ring-blue-600 focus-within:ring-offset-2 ${
            esBorrador && !isPending
              ? 'cursor-pointer bg-blue-600 hover:bg-blue-700 active:scale-[0.98]'
              : 'cursor-not-allowed bg-slate-300'
          }`}
        >
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FileUp className="h-3.5 w-3.5" />
          )}
          {isPending ? 'Guardando…' : 'Subir planilla llena'}
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            disabled={!esBorrador || isPending}
            onChange={(e) => onFileSelected(e.target.files?.[0])}
            className="sr-only"
          />
        </label>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
          <p>{error}</p>
        </div>
      )}
    </div>
  )
}
