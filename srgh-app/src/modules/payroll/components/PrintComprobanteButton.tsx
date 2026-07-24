'use client'

import { Printer } from 'lucide-react'

/**
 * window.print() con el diálogo del navegador: el usuario elige "Guardar
 * como PDF" o imprimir directo. Evita agregar una librería de PDF nueva al
 * proyecto — el CSS de @media print (ver globals.css) oculta esta barra.
 */
export function PrintComprobanteButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm outline-none transition hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
    >
      <Printer className="h-3.5 w-3.5" />
      Imprimir / Guardar como PDF
    </button>
  )
}
