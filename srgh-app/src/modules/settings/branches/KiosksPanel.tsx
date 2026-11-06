'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Alert } from '@/components/ui/Alert'
import { INPUT_CLASSES, Labeled } from '@/modules/employees/components/EmployeeFields'
import type { Branch, BranchSettings, Kiosk } from './types'
import { createKiosk, provisionKiosk, setKioskState, moveKiosk, renameKiosk } from './actions'

const labels: Record<string, string> = {
  pendiente: 'Pendiente de cuenta',
  activo: 'Habilitado',
  bloqueado: 'Bloqueado',
}
export function KiosksPanel({ branch, data }: { branch: Branch; data: BranchSettings }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const kiosks = data.kiosks.filter((k) => k.kio_sucursal_id === branch.suc_id)
  async function run(task: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const r = await task()
      if (!r.ok) {
        setError(r.error ?? 'No se pudo completar la operación.')
        return
      }
      setMessage(success)
      router.refresh()
    } catch {
      setError('No se pudo completar la operación. Revisá la conexión y reintentá.')
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }
  function block(k: Kiosk) {
    if (
      window.confirm(
        `¿Bloquear ${k.kio_nombre}? No podrá reconocer ni guardar marcas, aunque conserve una sesión abierta. Las marcas pendientes quedarán para revisión del encargado.`
      )
    )
      void run(
        () => setKioskState(k.kio_id, false),
        'Kiosco bloqueado. Las sesiones anteriores ya no pueden operar.'
      )
  }
  return (
    <section className="space-y-5" aria-labelledby="branch-kiosks">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="branch-kiosks" className="text-lg font-bold">
            Kioscos de {branch.suc_nombre}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Un acceso por terminal; teléfonos, tablets y computadoras.
          </p>
        </div>
        <Button disabled={busy || !branch.suc_activa} onClick={() => setAdding(!adding)}>
          {adding ? 'Cerrar formulario' : 'Registrar kiosco'}
        </Button>
      </div>
      {!branch.suc_activa && (
        <Alert tone="info">Activá la sucursal para registrar o habilitar sus kioscos.</Alert>
      )}
      {error && <Alert>{error}</Alert>}
      {message && (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          {message}
        </p>
      )}
      {adding && (
        <form
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-5"
          onSubmit={(e) => {
            e.preventDefault()
            void run(async () => {
              const r = await createKiosk({ nombre: name, email, sucursal_id: branch.suc_id })
              if (r.ok) {
                setAdding(false)
                setName('')
                setEmail('')
              }
              return r
            }, 'Kiosco registrado. Ahora invitá o vinculá su cuenta.')
          }}
        >
          <fieldset disabled={busy} className="space-y-4">
            <legend className="mb-3 font-bold">Nuevo acceso de kiosco</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Labeled label="Nombre de la terminal *">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  minLength={2}
                  maxLength={80}
                  required
                  className={INPUT_CLASSES}
                  placeholder="Por ejemplo: Mostrador 1"
                />
              </Labeled>
              <Labeled label="Correo de acceso *">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className={INPUT_CLASSES}
                />
              </Labeled>
            </div>
            <p className="text-sm text-slate-600">
              Usá un correo o alias único que reciba la empresa. No uses la cuenta personal de un
              empleado ni compartas la misma cuenta entre terminales. Registrar no envía un correo
              todavía.
            </p>
            {data.legacy.length > 0 && (
              <Labeled label="Usar una cuenta KIOSCO existente">
                <select
                  className={INPUT_CLASSES}
                  value=""
                  onChange={(e) => {
                    setEmail(e.target.value)
                    if (!name) setName('Kiosco existente')
                  }}
                >
                  <option value="">Seleccionar cuenta…</option>
                  {data.legacy.map((u) => (
                    <option
                      key={u.id}
                      value={u.email}
                      disabled={u.sucursales.length !== 1 || u.sucursales[0] !== branch.suc_id}
                    >
                      {u.email}
                      {u.sucursales.length !== 1
                        ? ' — corregir asignación'
                        : u.sucursales[0] !== branch.suc_id
                          ? ' — otra sucursal'
                          : ''}
                    </option>
                  ))}
                </select>
              </Labeled>
            )}
            <Button type="submit" disabled={busy}>
              {busy ? 'Registrando…' : 'Guardar registro'}
            </Button>
          </fieldset>
        </form>
      )}
      {kiosks.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-6 text-slate-600">
          Esta sucursal todavía no tiene kioscos registrados.
        </p>
      ) : (
        <ul className="space-y-3">
          {kiosks.map((k) => (
            <li
              key={k.kio_id}
              className="space-y-4 rounded-xl border border-slate-200 bg-white p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="break-words font-bold">{k.kio_nombre}</h3>
                  <p className="break-all text-sm text-slate-600">{k.kio_email}</p>
                </div>
                <Badge
                  tone={
                    k.kio_estado === 'activo'
                      ? 'emerald'
                      : k.kio_estado === 'bloqueado'
                        ? 'rose'
                        : 'amber'
                  }
                >
                  {labels[k.kio_estado] ?? k.kio_estado}
                </Badge>
              </div>
              <p className="text-sm text-slate-600">
                {k.kio_ultima_actividad
                  ? `Última actividad: ${new Date(k.kio_ultima_actividad).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' })}`
                  : 'Todavía no hay actividad registrada.'}{' '}
                La habilitación no indica que esté conectado ahora.
              </p>
              <div className="flex flex-wrap gap-2">
                {!k.kio_usuario_id && k.kio_estado !== 'bloqueado' && (
                  <>
                    <Button
                      disabled={busy || !branch.suc_activa}
                      onClick={() =>
                        void run(
                          () => provisionKiosk(k.kio_id, 'invitar'),
                          'Invitación enviada y cuenta vinculada. Revisá el buzón de la empresa.'
                        )
                      }
                    >
                      Enviar invitación
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={busy || !branch.suc_activa}
                      onClick={() => {
                        if (
                          window.confirm(
                            'Se validará la cuenta de este correo y se asignará a este kiosco. Debe ser una cuenta técnica sin empleado y de esta sucursal.'
                          )
                        )
                          void run(
                            () => provisionKiosk(k.kio_id, 'vincular'),
                            'Cuenta vinculada al kiosco.'
                          )
                      }}
                    >
                      Completar vínculo
                    </Button>
                  </>
                )}
                {k.kio_usuario_id && k.kio_estado === 'activo' && (
                  <>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () => provisionKiosk(k.kio_id, 'reenviar'),
                          'Invitación reenviada al correo del kiosco.'
                        )
                      }
                    >
                      Reenviar invitación
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () => provisionKiosk(k.kio_id, 'recuperar'),
                          'Correo de recuperación enviado.'
                        )
                      }
                    >
                      Recuperar acceso
                    </Button>
                  </>
                )}
                {k.kio_estado !== 'bloqueado' ? (
                  <Button variant="danger" disabled={busy} onClick={() => block(k)}>
                    Bloquear kiosco
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    disabled={busy || !branch.suc_activa}
                    onClick={() =>
                      void run(
                        () => setKioskState(k.kio_id, true),
                        'Kiosco desbloqueado. Completá su cuenta si está pendiente e iniciá una captura nueva; los comprobantes anteriores no se reactivan.'
                      )
                    }
                  >
                    Habilitar kiosco
                  </Button>
                )}
              </div>
              <details className="text-sm">
                <summary className="cursor-pointer text-brand-700">Cambiar nombre</summary>
                <form
                  className="mt-3 flex flex-wrap items-end gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    const name = String(new FormData(e.currentTarget).get('nombre') ?? '')
                    void run(() => renameKiosk(k.kio_id, name), 'Nombre actualizado.')
                  }}
                >
                  <label className="grow">
                    Nombre de la terminal
                    <input
                      className={INPUT_CLASSES}
                      name="nombre"
                      defaultValue={k.kio_nombre}
                      required
                      minLength={2}
                      maxLength={80}
                      disabled={busy}
                    />
                  </label>
                  <Button type="submit" variant="secondary" disabled={busy}>
                    Guardar nombre
                  </Button>
                </form>
              </details>
              {!k.kio_usuario_id && (
                <p className="text-sm text-slate-600">
                  Hasta completar el vínculo, una cuenta existente conserva su configuración
                  anterior. Este registro todavía no administra sus sesiones.
                </p>
              )}
              {k.kio_estado === 'bloqueado' && (
                <form
                  className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4"
                  onSubmit={(e) => {
                    e.preventDefault()
                    const id = Number(new FormData(e.currentTarget).get('sucursal'))
                    if (
                      window.confirm(
                        '¿Cambiar la sucursal de este kiosco? Seguirá bloqueado. Las marcas pendientes de la ubicación anterior no se trasladarán; deben revisarse manualmente.'
                      )
                    )
                      void run(
                        () => moveKiosk(k.kio_id, id),
                        'Asignación cambiada. El kiosco sigue bloqueado hasta que lo habilités desde su nueva sucursal.'
                      )
                  }}
                >
                  <label className="min-w-0 grow text-sm font-medium">
                    Cambiar sucursal
                    <select
                      name="sucursal"
                      defaultValue={k.kio_sucursal_id}
                      className={INPUT_CLASSES}
                      disabled={busy}
                    >
                      {data.branches
                        .filter((b) => b.suc_activa)
                        .map((b) => (
                          <option key={b.suc_id} value={b.suc_id}>
                            {b.suc_nombre}
                          </option>
                        ))}
                    </select>
                  </label>
                  <Button type="submit" variant="secondary" disabled={busy}>
                    Cambiar asignación
                  </Button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm text-slate-600">
        El rol KIOSCO solo permite marcar. Registrar un acceso no identifica el hardware: protegé
        las credenciales. La captura de rostros se administra desde el perfil del empleado.
      </p>
    </section>
  )
}
