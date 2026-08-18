'use client'

import { useState } from 'react'
import { ChevronDown, UserPlus } from 'lucide-react'
import type { EmpleadoSinUsuario } from '@/modules/users/types'
import { Button } from '@/components/ui/Button'

interface EmployeesWithoutUserBannerProps {
  empleados: EmpleadoSinUsuario[]
  onInvite: (empleado: EmpleadoSinUsuario) => void
}

/**
 * Bloque de empleados activos que aún no tienen cuenta: el botón abre el
 * formulario de invitación precargado con el empleado y su email personal.
 */
export function EmployeesWithoutUserBanner({
  empleados,
  onInvite,
}: EmployeesWithoutUserBannerProps) {
  const [expanded, setExpanded] = useState(false)

  if (empleados.length === 0) {
    return null
  }

  return (
    <div className="overflow-hidden rounded-xl border border-amber-200 bg-amber-50/70">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left outline-none transition hover:bg-amber-100/60 focus-visible:ring-2 focus-visible:ring-amber-500/60"
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-amber-600 shadow-sm ring-1 ring-amber-200">
            <UserPlus className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-amber-900">
              {empleados.length === 1
                ? '1 empleado activo sin cuenta de usuario'
                : `${empleados.length} empleados activos sin cuenta de usuario`}
            </p>
            <p className="text-[11px] text-amber-700">
              Puedes crearles la cuenta con la invitación precargada.
            </p>
          </div>
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-amber-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded && (
        <ul className="divide-y divide-amber-100 border-t border-amber-100 bg-white/60">
          {empleados.map((empleado) => (
            <li key={empleado.emp_id} className="flex items-center justify-between gap-3 px-4 py-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-slate-800">
                  {empleado.nombre_completo}
                </p>
                <p className="truncate text-[11px] text-slate-500">
                  {empleado.puesto_nombre ?? 'Sin puesto'}
                  {empleado.email_personal ? ` · ${empleado.email_personal}` : ''}
                </p>
              </div>
              <Button onClick={() => onInvite(empleado)} className="shrink-0">
                <UserPlus className="h-3 w-3" /> Crear usuario
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
