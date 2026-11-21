import { beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UnsavedChangesProvider } from '@/components/ui/UnsavedChangesProvider'
import { KiosksPanel } from './KiosksPanel'
import { createKiosk, renameKiosk, setKioskLogin, setKioskPassword, setKioskState } from './actions'
import type { Branch, BranchSettings, Kiosk } from './types'
vi.mock('./actions', () => ({
  createKiosk: vi.fn(),
  setKioskState: vi.fn(),
  setKioskPassword: vi.fn(),
  setKioskLogin: vi.fn(),
  moveKiosk: vi.fn(),
  renameKiosk: vi.fn(),
}))
vi.mock('nextjs-nav-guard', () => ({
  NavigationGuardProvider: ({ children }: { children: React.ReactNode }) => children,
  useNavigationGuard: vi.fn(),
}))
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
const branch = { suc_id: 10, suc_nombre: 'Centro', suc_activa: true } as Branch
const kiosk = {
  kio_id: '00000000-0000-4000-8000-000000000001',
  kio_sucursal_id: 10,
  kio_nombre: 'Mostrador',
  kio_email: 'kiosk-1@kiosk.sgrh.internal',
  kio_login: 'centro-caja1',
  kio_usuario_id: 2,
  kio_estado: 'activo',
  kio_ultima_actividad: null,
} as Kiosk
function setup(kiosks: Kiosk[] = [kiosk], active = true) {
  const b = { ...branch, suc_activa: active }
  return render(
    <UnsavedChangesProvider>
      <KiosksPanel
        branch={b}
        data={
          {
            branches: [b],
            brands: [],
            kiosks,
            audit: [],
            canManageKiosks: true,
          } as BranchSettings
        }
      />
    </UnsavedChangesProvider>
  )
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
describe('kiosk settings', () => {
  async function fillRegistration() {
    await userEvent.click(screen.getByRole('button', { name: 'Registrar kiosco' }))
    await userEvent.type(
      screen.getByRole('textbox', { name: /nombre de la terminal/i }),
      'Mostrador 1'
    )
    await userEvent.type(screen.getByRole('textbox', { name: /usuario de acceso/i }), 'Caja1')
    await userEvent.type(screen.getByLabelText('Contraseña *'), 'Kiosco#Seguro1')
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Registrar kiosco' })
    )
  }
  it('registers a terminal with username and password, without an email', async () => {
    vi.mocked(createKiosk).mockResolvedValue({ ok: true, data: { id: 'new' } })
    setup([])
    await fillRegistration()
    await waitFor(() =>
      expect(createKiosk).toHaveBeenCalledWith({
        nombre: 'Mostrador 1',
        login: 'Caja1',
        password: 'Kiosco#Seguro1',
        sucursal_id: 10,
      })
    )
    expect(await screen.findByRole('status')).toHaveTextContent('«caja1»')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(refresh).toHaveBeenCalled()
  })
  it('closes the form and shows the access error when the kiosk was saved without access', async () => {
    vi.mocked(createKiosk).mockResolvedValue({
      ok: true,
      data: { id: 'new', accessError: 'Supabase rechazó el correo interno.' },
    })
    setup([])
    await fillRegistration()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El kiosco quedó registrado, pero sin acceso: Supabase rechazó el correo interno.'
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(refresh).toHaveBeenCalled()
  })
  it('shows no help text until the username or the password needs it', async () => {
    setup([])
    await userEvent.click(screen.getByRole('button', { name: 'Registrar kiosco' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).queryByText(/De 3 a 40 caracteres/)).not.toBeInTheDocument()
    expect(within(dialog).queryByText('Al menos 12 caracteres')).not.toBeVisible()
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: /usuario de acceso/i }),
      'caja 1'
    )
    expect(within(dialog).getByText(/De 3 a 40 caracteres/)).toBeInTheDocument()
    await userEvent.type(within(dialog).getByLabelText('Contraseña *'), 'Prueba1')
    expect(within(dialog).getByText('Al menos 12 caracteres')).toBeVisible()
    expect(within(dialog).getAllByText('(cumplido)')).toHaveLength(3)
  })
  it('no longer offers to adopt an existing KIOSCO account', async () => {
    setup([])
    await userEvent.click(screen.getByRole('button', { name: 'Registrar kiosco' }))
    expect(screen.queryByText(/cuenta KIOSCO existente/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })
  it('shows the username of the kiosk, never its internal address', () => {
    setup()
    expect(screen.getByText('centro-caja1')).toBeInTheDocument()
    expect(screen.queryByText(/kiosk\.sgrh\.internal/)).not.toBeInTheDocument()
  })
  it('keeps every form out of the card until an action opens it', () => {
    setup()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/contraseña/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Editar Mostrador' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Contraseña' })).toBeInTheDocument()
  })
  it('changes the password in its own dialog and tells that its sessions were closed', async () => {
    vi.mocked(setKioskPassword).mockResolvedValue({ ok: true, data: undefined })
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Contraseña' }))
    const dialog = screen.getByRole('dialog', { name: 'Contraseña de Mostrador' })
    expect(dialog).toHaveTextContent(/todos los aparatos/)
    await userEvent.type(within(dialog).getByLabelText('Nueva contraseña *'), 'Otra#Clave123')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar contraseña' }))
    await waitFor(() =>
      expect(setKioskPassword).toHaveBeenCalledWith(kiosk.kio_id, 'Otra#Clave123')
    )
    expect(await screen.findByRole('status')).toHaveTextContent(/todos los aparatos/)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('keeps the dialog open with the error when the password is rejected', async () => {
    vi.mocked(setKioskPassword).mockResolvedValue({ ok: false, error: 'Contraseña débil.' })
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Contraseña' }))
    const dialog = screen.getByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Nueva contraseña *'), 'Otra#Clave123')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar contraseña' }))
    expect(await within(dialog).findByText('Contraseña débil.')).toBeInTheDocument()
  })
  it('points a kiosk without access to defining its password', () => {
    setup([{ ...kiosk, kio_usuario_id: null, kio_estado: 'pendiente' }])
    expect(screen.getByText('Sin acceso')).toBeInTheDocument()
    expect(screen.getByText(/Todavía no puede iniciar sesión/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Definir contraseña' })).toBeEnabled()
  })
  it('edits name and username in one dialog, saving only what changed', async () => {
    vi.mocked(setKioskLogin).mockResolvedValue({ ok: true, data: undefined })
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Editar Mostrador' }))
    const dialog = screen.getByRole('dialog', { name: 'Editar Mostrador' })
    const input = within(dialog).getByRole('textbox', { name: 'Usuario de acceso *' })
    await userEvent.clear(input)
    await userEvent.type(input, 'norte.1')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(setKioskLogin).toHaveBeenCalledWith(kiosk.kio_id, 'norte.1'))
    expect(renameKiosk).not.toHaveBeenCalled()
    expect(await screen.findByRole('status')).toHaveTextContent('Cambios guardados.')
  })
  it('asks before discarding unsaved edits with Cancelar', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Editar Mostrador' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Nombre de la terminal *' }), ' nuevo')
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Salir sin guardar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(renameKiosk).not.toHaveBeenCalled()
  })
  it('shows that a kiosk from before SGRH-111 still signs in with its email', () => {
    setup([{ ...kiosk, kio_login: null, kio_email: 'tablet@empresa.com' }])
    expect(screen.getByText('Sin usuario: entra con tablet@empresa.com')).toBeInTheDocument()
  })
  it('uses the shared modal and closes an untouched form with its X', async () => {
    setup([])
    await userEvent.click(screen.getByRole('button', { name: 'Registrar kiosco' }))
    const modal = screen.getByRole('dialog', { name: 'Registrar kiosco' })
    expect(screen.queryByText('Cerrar formulario')).not.toBeInTheDocument()
    await userEvent.click(within(modal).getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(createKiosk).not.toHaveBeenCalled()
  })
  it('protects a dirty modal, preserves edits on stay and clears them only on explicit discard', async () => {
    setup([])
    await userEvent.click(screen.getByRole('button', { name: 'Registrar kiosco' }))
    await userEvent.type(
      screen.getByRole('textbox', { name: /nombre de la terminal/i }),
      'Mostrador borrador'
    )
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Seguir editando' }))
    expect(screen.getByRole('textbox', { name: /nombre de la terminal/i })).toHaveValue(
      'Mostrador borrador'
    )
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Salir sin guardar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Registrar kiosco' }))
    expect(screen.getByRole('textbox', { name: /nombre de la terminal/i })).toHaveValue('')
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(createKiosk).not.toHaveBeenCalled()
  })
  async function startBlock() {
    await userEvent.click(screen.getByRole('button', { name: 'Más acciones de Mostrador' }))
    await userEvent.click(screen.getByRole('button', { name: 'Bloquear kiosco' }))
  }
  it('keeps blocking behind the actions menu', () => {
    setup()
    expect(screen.queryByRole('button', { name: 'Bloquear kiosco' })).not.toBeInTheDocument()
  })
  it('recovers the controls on a rejected transport request', async () => {
    vi.mocked(setKioskState).mockRejectedValueOnce(new TypeError('Network failed'))
    setup()
    await startBlock()
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar bloqueo' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/conexión/))
    expect(screen.getByRole('button', { name: 'Más acciones de Mostrador' })).toBeEnabled()
    expect(refresh).not.toHaveBeenCalled()
  })
  it('does not block without confirmation and allows cancellation', async () => {
    setup()
    await startBlock()
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(setKioskState).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(setKioskState).not.toHaveBeenCalled()
  })
  it('locks controls while a block is in flight', async () => {
    let finish!: (v: { ok: true; data: undefined }) => void
    vi.mocked(setKioskState).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    setup()
    await startBlock()
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar bloqueo' }))
    expect(screen.getByRole('button', { name: 'Editar Mostrador' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Más acciones de Mostrador' })).toBeDisabled()
    finish({ ok: true, data: undefined })
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
  })
  it('moves a blocked kiosk from its menu, with the warning in the dialog', async () => {
    setup([{ ...kiosk, kio_estado: 'bloqueado' }])
    expect(screen.getByText(/No puede registrar asistencia/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Más acciones de Mostrador' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar de sucursal' }))
    expect(screen.getByRole('dialog')).toHaveTextContent(/Seguirá bloqueado/)
  })
  it('does not register or enable kiosks in an inactive branch', () => {
    setup([{ ...kiosk, kio_estado: 'bloqueado' }], false)
    expect(screen.getByRole('button', { name: 'Registrar kiosco' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Habilitar' })).toBeDisabled()
  })
})
