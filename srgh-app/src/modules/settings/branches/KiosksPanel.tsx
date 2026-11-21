'use client'

import { useId, useRef, useState } from 'react'
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import {
  INPUT_CLASSES,
  LABEL_CLASSES,
  Labeled,
} from '@/modules/employees/components/EmployeeFields'
import type { Branch, BranchSettings, Kiosk } from './types'
import {
  createKiosk,
  setKioskLogin,
  setKioskPassword,
  setKioskState,
  moveKiosk,
  renameKiosk,
} from './actions'
import { Check, Circle, Eye, EyeOff } from 'lucide-react'
import { FIELD_ERROR } from '@/components/ui/styles'
import { KIOSK_LOGIN_HINT, KIOSK_LOGIN_PATTERN, normalizeKioskLogin } from '@/lib/kiosk/login'
import { PASSWORD_RULES } from '@/modules/auth/types'
import { KioskCard } from './KioskCard'

// Deja lugar al ojo dentro del campo. `cn` no resuelve conflictos de clases,
// así que se cambia el padding en la cadena en vez de sumar otra clase.
const PASSWORD_INPUT_CLASSES = INPUT_CLASSES.replace('px-3', 'pl-3 pr-11')

/**
 * Contraseña del kiosco con el mismo comportamiento que la de activar cuenta
 * (`SetPasswordForm`): el ojo va dentro del campo, y los requisitos aparecen
 * solo mientras lo escrito no los cumple, marcándose a medida que se cumplen.
 */
function PasswordField({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (value: string) => void
  label: string
}) {
  const [visible, setVisible] = useState(false)
  const id = useId()
  const rulesId = `${id}-requisitos`
  const pending = value.length > 0 && !PASSWORD_RULES.every((rule) => rule.patron.test(value))
  return (
    <div>
      <label htmlFor={id} className={`block ${LABEL_CLASSES}`}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="new-password"
          required
          aria-describedby={rulesId}
          className={PASSWORD_INPUT_CLASSES}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 transition hover:text-slate-600 disabled:cursor-not-allowed"
        >
          {visible ? (
            <EyeOff className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Eye className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>
      {/* Oculta con `hidden` y no desmontada: el lector de pantalla la lee al
          entrar al campo aunque no se vea, igual que en SetPasswordForm. */}
      <ul id={rulesId} hidden={!pending} className="mt-2 grid gap-1 sm:grid-cols-2">
        {PASSWORD_RULES.map((rule) => {
          const met = rule.patron.test(value)
          return (
            <li
              key={rule.id}
              className={`flex items-center gap-1.5 text-xs ${met ? 'text-emerald-600' : 'text-slate-500'}`}
            >
              {met ? (
                <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <Circle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              )}
              <span>{rule.etiqueta}</span>
              <span className="sr-only">{met ? '(cumplido)' : '(pendiente)'}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Usuario de acceso: solo avisa cuando lo escrito no sirve, sin texto de ayuda fijo. */
function LoginField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const normalized = normalizeKioskLogin(value)
  const invalid = normalized.length > 0 && !KIOSK_LOGIN_PATTERN.test(normalized)
  return (
    <div>
      <Labeled label="Usuario de acceso *">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={40}
          required
          aria-invalid={invalid}
          className={INPUT_CLASSES}
          placeholder="Por ejemplo: centro-caja1"
        />
      </Labeled>
      {invalid && <p className={FIELD_ERROR}>{KIOSK_LOGIN_HINT}</p>}
    </div>
  )
}

/** Pie de los modales del kiosco: mismo orden y estilo que el de marcas. */
function DialogActions({
  busy,
  onCancel,
  submit,
}: {
  busy: boolean
  onCancel: () => void
  submit: string
}) {
  return (
    <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
      <Button type="button" variant="secondary" size="md" disabled={busy} onClick={onCancel}>
        Cancelar
      </Button>
      <Button type="submit" size="md" disabled={busy}>
        {busy ? 'Guardando…' : submit}
      </Button>
    </div>
  )
}

type KioskDialog = { kind: 'editar' | 'clave' | 'sucursal'; kiosk: Kiosk }
const EMPTY_FORM = { nombre: '', login: '', password: '', sucursal: '' }

export function KiosksPanel({ branch, data }: { branch: Branch; data: BranchSettings }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [blocking, setBlocking] = useState<Kiosk | null>(null)
  const [name, setName] = useState('')
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [dialog, setDialog] = useState<KioskDialog | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const dialogGuard = useUnsavedChanges({
    label: 'los cambios del kiosco',
    value: form,
    busy,
    enabled: dialog !== null,
  })
  const registrationGuard = useUnsavedChanges({
    label: 'el registro del kiosco',
    value: { name, login, password },
    busy,
    enabled: adding,
  })
  function resetRegistration() {
    setName('')
    setLogin('')
    setPassword('')
  }
  function closeRegistration() {
    setAdding(false)
    resetRegistration()
    setError(null)
  }
  function openDialog(next: KioskDialog) {
    const initial = {
      ...EMPTY_FORM,
      nombre: next.kiosk.kio_nombre,
      login: next.kiosk.kio_login ?? '',
      sucursal: String(next.kiosk.kio_sucursal_id),
    }
    dialogGuard.acceptChanges(initial)
    setForm(initial)
    setError(null)
    setMessage(null)
    setDialog(next)
  }
  function closeDialog(saved = false) {
    if (saved) dialogGuard.acceptChanges()
    setDialog(null)
    setForm(EMPTY_FORM)
    if (!saved) setError(null)
  }
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
  return (
    <section className="space-y-5" aria-labelledby="branch-kiosks">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="branch-kiosks" className="text-lg font-bold">
            Kioscos ({kiosks.length})
          </h2>
        </div>
        <Button
          disabled={busy || !branch.suc_activa}
          onClick={() => {
            registrationGuard.acceptChanges()
            setError(null)
            setAdding(true)
          }}
        >
          Registrar kiosco
        </Button>
      </div>
      {!branch.suc_activa && (
        <Alert tone="info">Activá la sucursal para registrar o habilitar sus kioscos.</Alert>
      )}
      {error && !adding && !dialog && <Alert>{error}</Alert>}
      {message && (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          {message}
        </p>
      )}
      {adding && (
        <Modal title="Registrar kiosco" onClose={closeRegistration}>
          <form
            ref={(element) => registrationGuard.bindRoot(element)}
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              const accessLogin = login.trim().toLowerCase()
              void run(async () => {
                const r = await createKiosk({
                  nombre: name,
                  login,
                  password,
                  sucursal_id: branch.suc_id,
                })
                if (!r.ok) return r
                setAdding(false)
                resetRegistration()
                // El kiosco quedó registrado aunque su acceso fallara: el error
                // se muestra fuera del modal, junto a "Definir contraseña".
                if (r.data.accessError) {
                  router.refresh()
                  return {
                    ok: false,
                    error: `El kiosco quedó registrado, pero sin acceso: ${r.data.accessError}`,
                  }
                }
                return r
              }, `Kiosco registrado y habilitado. Ya puede entrar con el usuario «${accessLogin}».`)
            }}
          >
            {error && <Alert>{error}</Alert>}
            <fieldset disabled={busy} className="space-y-4">
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
              <LoginField value={login} onChange={setLogin} />
              <PasswordField label="Contraseña *" value={password} onChange={setPassword} />
              <DialogActions
                busy={busy}
                onCancel={() => registrationGuard.confirmLeave(closeRegistration)}
                submit="Registrar kiosco"
              />
            </fieldset>
          </form>
        </Modal>
      )}
      {kiosks.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-6 text-slate-600">
          Esta sucursal todavía no tiene kioscos registrados.
        </p>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {kiosks.map((k) => (
            <KioskCard
              key={k.kio_id}
              kiosk={k}
              busy={busy}
              branchActive={branch.suc_activa}
              onEdit={() => openDialog({ kind: 'editar', kiosk: k })}
              onPassword={() => openDialog({ kind: 'clave', kiosk: k })}
              onMove={() => openDialog({ kind: 'sucursal', kiosk: k })}
              onBlock={() => setBlocking(k)}
              onEnable={() =>
                void run(
                  () => setKioskState(k.kio_id, true),
                  k.kio_usuario_id
                    ? 'Kiosco habilitado. Los comprobantes faciales anteriores ya no sirven.'
                    : 'Kiosco habilitado. Definí su contraseña para que pueda iniciar sesión.'
                )
              }
            />
          ))}
        </ul>
      )}
      {dialog?.kind === 'editar' && (
        <Modal title={`Editar ${dialog.kiosk.kio_nombre}`} onClose={closeDialog}>
          <form
            ref={(element) => dialogGuard.bindRoot(element)}
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              const k = dialog.kiosk
              void run(async () => {
                if (form.nombre.trim() !== k.kio_nombre) {
                  const renamed = await renameKiosk(k.kio_id, form.nombre)
                  if (!renamed.ok) return renamed
                }
                if (form.login.trim().toLowerCase() !== (k.kio_login ?? '')) {
                  const relogged = await setKioskLogin(k.kio_id, form.login)
                  if (!relogged.ok) return relogged
                }
                closeDialog(true)
                return { ok: true }
              }, 'Cambios guardados.')
            }}
          >
            {error && <Alert>{error}</Alert>}
            <fieldset disabled={busy} className="space-y-4">
              <Labeled label="Nombre de la terminal *">
                <input
                  value={form.nombre}
                  onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                  minLength={2}
                  maxLength={80}
                  required
                  className={INPUT_CLASSES}
                />
              </Labeled>
              <LoginField
                value={form.login}
                onChange={(login) => setForm((f) => ({ ...f, login }))}
              />
              <DialogActions
                busy={busy}
                onCancel={() => dialogGuard.confirmLeave(() => closeDialog())}
                submit="Guardar cambios"
              />
            </fieldset>
          </form>
        </Modal>
      )}
      {dialog?.kind === 'clave' && (
        <Modal
          title={
            dialog.kiosk.kio_usuario_id
              ? `Contraseña de ${dialog.kiosk.kio_nombre}`
              : `Definir contraseña de ${dialog.kiosk.kio_nombre}`
          }
          subtitle={dialog.kiosk.kio_login ? `Usuario: ${dialog.kiosk.kio_login}` : undefined}
          onClose={closeDialog}
        >
          <form
            ref={(element) => dialogGuard.bindRoot(element)}
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              const k = dialog.kiosk
              void run(
                async () => {
                  const r = await setKioskPassword(k.kio_id, form.password)
                  if (r.ok) closeDialog(true)
                  return r
                },
                k.kio_usuario_id
                  ? 'Contraseña cambiada. Se cerró la sesión del kiosco en todos los aparatos.'
                  : 'Acceso creado. El kiosco ya puede iniciar sesión.'
              )
            }}
          >
            {error && <Alert>{error}</Alert>}
            <fieldset disabled={busy} className="space-y-4">
              <PasswordField
                label="Nueva contraseña *"
                value={form.password}
                onChange={(password) => setForm((f) => ({ ...f, password }))}
              />
              {dialog.kiosk.kio_usuario_id && (
                <Alert tone="info">Se cerrará la sesión del kiosco en todos los aparatos.</Alert>
              )}
              <DialogActions
                busy={busy}
                onCancel={() => dialogGuard.confirmLeave(() => closeDialog())}
                submit="Guardar contraseña"
              />
            </fieldset>
          </form>
        </Modal>
      )}
      {dialog?.kind === 'sucursal' && (
        <Modal title={`Cambiar de sucursal ${dialog.kiosk.kio_nombre}`} onClose={closeDialog}>
          <form
            ref={(element) => dialogGuard.bindRoot(element)}
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              const k = dialog.kiosk
              void run(async () => {
                const r = await moveKiosk(k.kio_id, Number(form.sucursal))
                if (r.ok) closeDialog(true)
                return r
              }, 'Sucursal cambiada. El kiosco sigue bloqueado hasta que lo habilités desde la nueva sucursal.')
            }}
          >
            {error && <Alert>{error}</Alert>}
            <fieldset disabled={busy} className="space-y-4">
              <Labeled label="Nueva sucursal *">
                <select
                  value={form.sucursal}
                  onChange={(e) => setForm((f) => ({ ...f, sucursal: e.target.value }))}
                  className={INPUT_CLASSES}
                >
                  {data.branches
                    .filter((b) => b.suc_activa)
                    .map((b) => (
                      <option key={b.suc_id} value={b.suc_id}>
                        {b.suc_nombre}
                      </option>
                    ))}
                </select>
              </Labeled>
              <Alert tone="info">
                Seguirá bloqueado en la nueva sucursal. Las marcas pendientes no se trasladan.
              </Alert>
              <DialogActions
                busy={busy}
                onCancel={() => dialogGuard.confirmLeave(() => closeDialog())}
                submit="Cambiar sucursal"
              />
            </fieldset>
          </form>
        </Modal>
      )}
      {blocking && (
        <ConfirmDialog
          title={`Bloquear ${blocking.kio_nombre}`}
          message="No podrá registrar asistencia, incluso con una sesión abierta. Las marcas pendientes quedarán para revisión."
          confirmLabel="Confirmar bloqueo"
          onCancel={() => setBlocking(null)}
          onConfirm={() => {
            const target = blocking
            setBlocking(null)
            void run(() => setKioskState(target.kio_id, false), 'Kiosco bloqueado.')
          }}
        />
      )}
    </section>
  )
}
