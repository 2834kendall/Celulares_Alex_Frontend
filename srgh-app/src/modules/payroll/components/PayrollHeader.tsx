import Link from 'next/link'
import { CalendarPlus, Clock, Coins, Gift } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { BUTTON_BASE, BUTTON_SIZES, BUTTON_VARIANTS } from '@/components/ui/Button'

interface PayrollHeaderProps {
  canWrite: boolean
  /** CATALOGOS_WRITE: gestiona el catálogo de conceptos, no solo periodos. */
  canManageConceptos: boolean
}

const SECONDARY = cn(BUTTON_BASE, BUTTON_VARIANTS.secondary, BUTTON_SIZES.sm)
const PRIMARY = cn(BUTTON_BASE, BUTTON_VARIANTS.primary, BUTTON_SIZES.sm)

/**
 * Encabezado de la pantalla de nómina: título + hasta cuatro acciones.
 *
 * Los enlaces tenian `shrink-0` con las clases del boton copiadas a mano:
 * en un telefono, cuatro botones sin permiso para encogerse desbordaban el
 * ancho de la pantalla. Ahora, bajo @sm, forman una rejilla de 2 columnas —
 * apilarlos los cuatro a ancho completo ocupaba demasiado alto, y con
 * exactamente cuatro acciones una rejilla de 2x2 es mas compacta que
 * cualquier numero variable, donde auto-fit tiene sentido pero aca no.
 */
export function PayrollHeader({ canWrite, canManageConceptos }: PayrollHeaderProps) {
  return (
    <div className="@container">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <h1 className="text-base font-bold text-slate-900">Nómina</h1>
          <p className="text-xs text-slate-500">
            Periodos de planilla, ingresos, deducciones y comprobantes de pago.
          </p>
        </div>

        <div className="grid w-full grid-cols-2 gap-2 @sm:w-auto @sm:flex @sm:flex-wrap @sm:items-center">
          {canWrite && (
            <Link href="/payroll/aguinaldo-liquidacion" className={cn(SECONDARY, '@sm:w-auto')}>
              <Gift className="h-3.5 w-3.5" aria-hidden="true" /> Aguinaldo y liquidación
            </Link>
          )}
          {canWrite && (
            <Link href="/payroll/banco-horas" className={cn(SECONDARY, '@sm:w-auto')}>
              <Clock className="h-3.5 w-3.5" aria-hidden="true" /> Banco de horas
            </Link>
          )}
          {canManageConceptos && (
            <Link href="/payroll/concepts" className={cn(SECONDARY, '@sm:w-auto')}>
              <Coins className="h-3.5 w-3.5" aria-hidden="true" /> Conceptos de nómina
            </Link>
          )}
          {canWrite && (
            <Link href="/payroll/new" className={cn(PRIMARY, '@sm:w-auto')}>
              <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" /> Nuevo periodo
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
