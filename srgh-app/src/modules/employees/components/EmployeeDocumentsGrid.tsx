'use client'

import { Download, File, FileImage, FileText, Pencil, Trash2, type LucideIcon } from 'lucide-react'
import { esFechaVencida, formatDate } from '@/modules/employees/lib/format'

export interface DocumentoCardItem {
  key: string
  nombre: string
  /** Categoría del documento — segunda línea de la card. */
  tipoNombre: string
  /** MIME real (server) o declarado (wizard): solo decide el ícono. */
  mime: string
  /** Va al title= de la card: en tres líneas no hay lugar para mostrarla. */
  descripcion: string | null
  fechaVencimiento: string | null
  /** Tercera línea cuando no hay vencimiento ("Subido el …" / "Pendiente de subir"). */
  detalle: string | null
}

interface EmployeeDocumentsGridProps {
  items: DocumentoCardItem[]
  emptyMessage: string
  busyKey?: string | null
  readOnly?: boolean
  onDownload?: (key: string) => void
  onEdit?: (key: string) => void
  onDelete?: (key: string) => void
}

const ACTION_BUTTON_CLASSES =
  'flex items-center justify-center rounded-md p-1.5 text-slate-400 outline-none transition hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-brand-500/60 disabled:opacity-50'

const DELETE_BUTTON_CLASSES =
  'flex items-center justify-center rounded-md p-1.5 text-slate-400 outline-none transition hover:bg-rose-50 hover:text-rose-600 focus-visible:ring-2 focus-visible:ring-rose-500/60 disabled:opacity-50'

/** Ícono + color por tipo de archivo, al estilo de un explorador de archivos. */
function iconoDe(mime: string): { Icon: LucideIcon; className: string } {
  if (mime === 'application/pdf') {
    return { Icon: FileText, className: 'bg-rose-50 text-rose-600' }
  }
  if (mime.startsWith('image/')) {
    return { Icon: FileImage, className: 'bg-sky-50 text-sky-600' }
  }
  return { Icon: File, className: 'bg-slate-100 text-slate-500' }
}

/**
 * Grilla de documentos con estética de explorador de archivos (SGRH-67):
 * ícono coloreado por tipo a la izquierda, nombre + metadata a la derecha y
 * acciones que aparecen al pasar el mouse.
 *
 * Es PLANA a propósito: el expediente de un solo empleado ronda los 10
 * documentos (el peor caso realista, alguien que acumula incapacidades, no
 * pasa de ~30). Agrupar por categoría fragmentaba la vista sin aportar; la
 * categoría se lee en cada card y el orden es por fecha descendente.
 */
export function EmployeeDocumentsGrid({
  items,
  emptyMessage,
  busyKey = null,
  readOnly = false,
  onDownload,
  onEdit,
  onDelete,
}: EmployeeDocumentsGridProps) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-8 text-center">
        <p className="text-xs text-slate-500">{emptyMessage}</p>
      </div>
    )
  }

  const hayAcciones = Boolean(onDownload) || (!readOnly && (Boolean(onEdit) || Boolean(onDelete)))

  return (
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
      {items.map((item) => {
        const { Icon, className } = iconoDe(item.mime)
        const vencido = esFechaVencida(item.fechaVencimiento)

        return (
          <div
            key={item.key}
            title={item.descripcion ?? undefined}
            className={`group flex items-start gap-3 rounded-xl border border-slate-200 bg-white py-3 pl-3 pr-2 transition hover:border-slate-300 ${
              busyKey === item.key ? 'opacity-50' : ''
            }`}
          >
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] ${className}`}
            >
              <Icon className="h-5 w-5" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800" title={item.nombre}>
                {item.nombre}
              </p>
              <p className="mt-0.5 truncate text-xs text-slate-400">{item.tipoNombre}</p>
              {vencido ? (
                <span className="mt-1 inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
                  Vencido
                </span>
              ) : item.fechaVencimiento ? (
                <p className="text-xs text-slate-400">Vence: {formatDate(item.fechaVencimiento)}</p>
              ) : (
                item.detalle && <p className="text-xs text-slate-400">{item.detalle}</p>
              )}
            </div>

            {hayAcciones && (
              // Ocultas hasta hover/foco (estética de explorador), pero SIEMPRE
              // en el DOM: se navegan con teclado vía focus-within y en móvil
              // —donde no hay hover— quedan visibles en fila.
              <div className="flex shrink-0 flex-col gap-0.5 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100 max-sm:flex-row max-sm:opacity-100">
                {onDownload && (
                  <button
                    type="button"
                    onClick={() => onDownload(item.key)}
                    className={ACTION_BUTTON_CLASSES}
                  >
                    <Download className="h-4 w-4" />
                    <span className="sr-only">Descargar {item.nombre}</span>
                  </button>
                )}
                {!readOnly && onEdit && (
                  <button
                    type="button"
                    onClick={() => onEdit(item.key)}
                    disabled={busyKey === item.key}
                    className={ACTION_BUTTON_CLASSES}
                  >
                    <Pencil className="h-4 w-4" />
                    <span className="sr-only">Editar {item.nombre}</span>
                  </button>
                )}
                {!readOnly && onDelete && (
                  <button
                    type="button"
                    onClick={() => onDelete(item.key)}
                    disabled={busyKey === item.key}
                    className={DELETE_BUTTON_CLASSES}
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Eliminar {item.nombre}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
