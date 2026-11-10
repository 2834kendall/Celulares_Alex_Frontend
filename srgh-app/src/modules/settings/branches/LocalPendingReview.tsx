'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  getQueuedMarks,
  getDiscardedMarks,
  type QueuedMark,
} from '@/modules/attendance/components/kiosk/offlineQueue'
import { Alert } from '@/components/ui/Alert'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'

type ReviewRow = { id: string; employeeId: number; tipo: string; fechaHora: string; motivo: string }
/** Local drafts are displayed only; this view never replays or deletes a mark. */
export function LocalPendingReview({ empresaId }: { empresaId: number }) {
  const [rows, setRows] = useState<ReviewRow[] | null>(null)
  const [unscoped, setUnscoped] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let active = true
    const start = setTimeout(() => {
      void Promise.all([getQueuedMarks(), getDiscardedMarks()])
        .then(([pending, discarded]) => {
          if (!active) return
          let unknown = 0
          const own = (mark: QueuedMark) => {
            const parts = mark.ticketFacial.split('.')
            if (parts.length !== 4) {
              unknown++
              return false
            }
            try {
              const scope = atob(parts[2].replace(/-/g, '+').replace(/_/g, '/'))
              return scope.startsWith(`${empresaId}:`)
            } catch {
              unknown++
              return false
            }
          }
          const data = [
            ...pending.filter(own).map((m) => ({
              id: m.id,
              employeeId: m.employeeId,
              tipo: m.tipo,
              fechaHora: m.fechaHora,
              motivo: 'Pendiente de sincronización',
            })),
            ...discarded.filter(own).map((m) => ({
              id: m.id,
              employeeId: m.employeeId,
              tipo: m.tipo,
              fechaHora: m.fechaHora,
              motivo: m.motivo,
            })),
          ]
          setRows(data.sort((a, b) => a.fechaHora.localeCompare(b.fechaHora)))
          setUnscoped(unknown)
          setError(null)
        })
        .catch(() => {
          if (active)
            setError(
              'No se pudo leer el almacenamiento local. No borrés los datos del navegador; reintentá desde el equipo que tiene los pendientes.'
            )
        })
    }, 0)
    return () => {
      active = false
      clearTimeout(start)
    }
  }, [empresaId, reload])
  return (
    <div className="space-y-5">
      <PageHeader
        title="Marcas pendientes de revisión"
        backHref="/settings/branches"
        description="Solo se leen los pendientes guardados en este navegador, no los de otros equipos."
      />
      <Alert tone="info">
        Este listado no registra ni elimina marcas. Revisá la asistencia existente antes de corregir
        manualmente desde el panel, para evitar duplicados. No borrés los datos del navegador hasta
        resolver los pendientes.
      </Alert>
      {error ? (
        <Alert>{error}</Alert>
      ) : rows === null ? (
        <p role="status">Leyendo pendientes…</p>
      ) : rows.length === 0 ? (
        <p className="text-slate-600">
          No hay pendientes con contexto de esta empresa en este navegador.
        </p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {rows.map((r) => (
            <li key={r.id} className="space-y-1 p-4 text-sm">
              <p className="font-bold">
                Colaborador #{r.employeeId} · {r.tipo} · {r.fechaHora}
              </p>
              <p className="text-slate-600">{r.motivo}</p>
              <p className="break-all text-xs text-slate-500">Referencia de operación: {r.id}</p>
            </li>
          ))}
        </ul>
      )}
      {unscoped > 0 && (
        <Alert tone="info">
          Hay {unscoped} pendientes antiguos sin empresa verificable en su formato. Se conservan;
          requieren revisión técnica del contexto original antes de mostrarlos o conciliarlos.
        </Alert>
      )}
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={() => setReload((v) => v + 1)}>
          Actualizar listado
        </Button>
        <Link href="/attendance" className="px-3 py-2 text-sm text-brand-700 underline">
          Abrir asistencia
        </Link>
      </div>
    </div>
  )
}
