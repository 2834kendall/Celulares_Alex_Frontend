'use client'

import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/Button'

/**
 * window.print() con el diálogo del navegador: el usuario elige "Guardar
 * como PDF" o imprimir directo. Evita agregar una librería de PDF nueva al
 * proyecto — el CSS de @media print (ver globals.css) oculta esta barra.
 */
export function PrintComprobanteButton() {
  return (
    <Button onClick={() => window.print()}>
      <Printer className="h-3.5 w-3.5" />
      Imprimir / Guardar como PDF
    </Button>
  )
}
