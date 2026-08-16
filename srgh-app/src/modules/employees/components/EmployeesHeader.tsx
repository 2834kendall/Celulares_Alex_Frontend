import Link from 'next/link'
import { Briefcase, UserPlus } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { BUTTON_BASE, BUTTON_SIZES, BUTTON_VARIANTS } from '@/components/ui/Button'

interface EmployeesHeaderProps {
  canWrite: boolean
  canAccessRecruitment: boolean
}

/**
 * Encabezado de la pantalla de empleados: título + acciones principales.
 * "Iniciar contratación" es el atajo a la futura ventana de reclutamiento.
 *
 * Los dos botones son `<Link>`, no `<button>`, así que toman las clases del
 * token compartido en vez de reescribirlas: antes estaban copiadas a mano y
 * ya se habían quedado sin la guarda de `motion-reduce`.
 */
export function EmployeesHeader({ canWrite, canAccessRecruitment }: EmployeesHeaderProps) {
  return (
    <div className="@container">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <h1 className="text-base font-bold text-slate-900">Empleados</h1>
          <p className="text-xs text-slate-500">
            Gestión del personal: ficha, contrato vigente y acceso al sistema.
          </p>
        </div>

        {/*
          En angosto los botones ocupan el ancho completo, uno debajo del
          otro: "Iniciar contratación" es largo y, comprimido a media fila,
          quedaba en dos renglones contra un botón azul de una sola línea.
          Apilados se leen parejos y el área tocable es toda la fila.
          Desde @sm vuelven a la derecha, como en escritorio.
        */}
        <div className="flex w-full flex-col gap-2 @sm:w-auto @sm:flex-row @sm:items-center">
          {canAccessRecruitment && (
            <Link
              href="/recruitment"
              className={cn(
                BUTTON_BASE,
                BUTTON_VARIANTS.secondary,
                BUTTON_SIZES.sm,
                'w-full @sm:w-auto'
              )}
            >
              <Briefcase className="h-3.5 w-3.5" aria-hidden="true" /> Iniciar contratación
            </Link>
          )}
          {canWrite && (
            <Link
              href="/employees/new"
              className={cn(
                BUTTON_BASE,
                BUTTON_VARIANTS.primary,
                BUTTON_SIZES.sm,
                'w-full @sm:w-auto'
              )}
            >
              <UserPlus className="h-3.5 w-3.5" aria-hidden="true" /> Nuevo empleado
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
