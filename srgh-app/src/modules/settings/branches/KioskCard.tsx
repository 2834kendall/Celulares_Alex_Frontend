'use client'

import { useEffect, useRef, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { CARD, META_LABEL } from '@/components/ui/styles'
import type { Kiosk } from './types'

const STATES: Record<string, { label: string; tone: 'emerald' | 'rose' | 'amber' }> = {
  activo: { label: 'Habilitado', tone: 'emerald' },
  bloqueado: { label: 'Bloqueado', tone: 'rose' },
  pendiente: { label: 'Sin acceso', tone: 'amber' },
}

function lastActivity(value: string | null) {
  return value
    ? new Date(value).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' })
    : 'Todavía no se usó'
}

interface KioskCardProps {
  kiosk: Kiosk
  busy: boolean
  /** La sucursal está activa: sin eso no se habilita ni se crea su acceso. */
  branchActive: boolean
  onEdit: () => void
  onPassword: () => void
  onBlock: () => void
  onEnable: () => void
  onMove: () => void
}

/**
 * Tarjeta de un kiosco (SGRH-111), con el mismo patrón que las marcas: arriba
 * solo información, abajo dos acciones y un menú "⋯" para lo que no se usa
 * todos los días. Cada acción abre su propio modal; la tarjeta nunca despliega
 * formularios adentro.
 */
export function KioskCard({
  kiosk: k,
  busy,
  branchActive,
  onEdit,
  onPassword,
  onBlock,
  onEnable,
  onMove,
}: KioskCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  const blocked = k.kio_estado === 'bloqueado'
  const hasAccess = !!k.kio_usuario_id
  const state = STATES[k.kio_estado] ?? { label: k.kio_estado, tone: 'amber' as const }

  return (
    <li className={`${CARD} flex min-w-0 flex-col gap-4 p-4 sm:p-5`}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 break-words text-base font-bold text-slate-900">{k.kio_nombre}</h3>
        <Badge tone={state.tone}>{state.label}</Badge>
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="min-w-0">
          <dt className={META_LABEL}>Usuario de acceso</dt>
          <dd className="mt-0.5 break-all text-slate-900">
            {k.kio_login ? (
              <span className="font-mono">{k.kio_login}</span>
            ) : (
              <span className="text-slate-600">Sin usuario: entra con {k.kio_email}</span>
            )}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className={META_LABEL}>Última actividad</dt>
          <dd className="mt-0.5 text-slate-900">{lastActivity(k.kio_ultima_actividad)}</dd>
        </div>
      </dl>

      {!blocked && !hasAccess && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Todavía no puede iniciar sesión. Definí su contraseña para habilitarlo.
        </p>
      )}
      {blocked && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
          No puede registrar asistencia hasta que lo habilités.
        </p>
      )}

      <div className="mt-auto flex items-center gap-2 border-t border-slate-100 pt-4">
        <Button
          onClick={onEdit}
          variant="secondary"
          size="md"
          disabled={busy}
          className="flex-1 justify-center"
          aria-label={`Editar ${k.kio_nombre}`}
        >
          Editar
        </Button>
        {blocked ? (
          <Button
            onClick={onEnable}
            size="md"
            disabled={busy || !branchActive}
            className="flex-1 justify-center"
          >
            Habilitar
          </Button>
        ) : (
          <Button
            onClick={onPassword}
            variant={hasAccess ? 'secondary' : 'primary'}
            size="md"
            disabled={busy || (!hasAccess && !branchActive)}
            className="flex-1 justify-center"
          >
            {hasAccess ? 'Contraseña' : 'Definir contraseña'}
          </Button>
        )}
        <div className="relative" ref={menuRef}>
          <Button
            onClick={() => setMenuOpen((open) => !open)}
            variant="secondary"
            size="md"
            disabled={busy}
            aria-label={`Más acciones de ${k.kio_nombre}`}
            aria-expanded={menuOpen}
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </Button>
          {menuOpen && (
            <div className="animate-menu-pop absolute bottom-full right-0 z-20 mb-2 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
              {blocked ? (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    onMove()
                  }}
                  className="block min-h-9 w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100 pointer-coarse:min-h-11"
                >
                  Cambiar de sucursal
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    onBlock()
                  }}
                  className="block min-h-9 w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-rose-700 hover:bg-rose-50 pointer-coarse:min-h-11"
                >
                  Bloquear kiosco
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  )
}
