import { beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { KiosksPanel } from './KiosksPanel'
import { createKiosk, setKioskState, provisionKiosk } from './actions'
import type { Branch, BranchSettings, Kiosk } from './types'
vi.mock('./actions', () => ({
  createKiosk: vi.fn(),
  setKioskState: vi.fn(),
  provisionKiosk: vi.fn(),
  moveKiosk: vi.fn(),
  renameKiosk: vi.fn(),
}))
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
const branch = { suc_id: 10, suc_nombre: 'Centro', suc_activa: true } as Branch
const kiosk = {
  kio_id: '00000000-0000-4000-8000-000000000001',
  kio_sucursal_id: 10,
  kio_nombre: 'Mostrador',
  kio_email: 'kiosk@example.test',
  kio_usuario_id: 2,
  kio_estado: 'activo',
  kio_ultima_actividad: null,
} as Kiosk
function setup(kiosks: Kiosk[] = [kiosk], active = true) {
  const b = { ...branch, suc_activa: active }
  return render(
    <KiosksPanel
      branch={b}
      data={
        { branches: [b], kiosks, legacy: [], audit: [], canManageKiosks: true } as BranchSettings
      }
    />
  )
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
describe('kiosk settings', () => {
  it('does not send invitations just by registering a terminal', async () => {
    vi.mocked(createKiosk).mockResolvedValue({ ok: true, data: 'new' })
    setup([])
    await userEvent.click(screen.getByRole('button', { name: 'Registrar kiosco' }))
    await userEvent.type(
      screen.getByRole('textbox', { name: /nombre de la terminal/i }),
      'Mostrador 1'
    )
    await userEvent.type(
      screen.getByRole('textbox', { name: /correo de acceso/i }),
      'kiosk@example.test'
    )
    await userEvent.click(screen.getByRole('button', { name: 'Guardar registro' }))
    await waitFor(() =>
      expect(createKiosk).toHaveBeenCalledWith({
        nombre: 'Mostrador 1',
        email: 'kiosk@example.test',
        sucursal_id: 10,
      })
    )
    expect(provisionKiosk).not.toHaveBeenCalled()
  })
  it('recovers the block control on a rejected transport request', async () => {
    vi.mocked(setKioskState).mockRejectedValueOnce(new TypeError('Network failed'))
    setup()
    await userEvent.click(screen.getByText('Administrar kiosco'))
    await userEvent.click(screen.getByRole('button', { name: 'Bloquear kiosco' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/conexión/))
    expect(screen.getByRole('button', { name: 'Bloquear kiosco' })).toBeEnabled()
    expect(refresh).not.toHaveBeenCalled()
  })
  it('does not block without confirmation', async () => {
    vi.mocked(window.confirm).mockReturnValue(false)
    setup()
    await userEvent.click(screen.getByText('Administrar kiosco'))
    await userEvent.click(screen.getByRole('button', { name: 'Bloquear kiosco' }))
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
    await userEvent.click(screen.getByText('Administrar kiosco'))
    await userEvent.click(screen.getByRole('button', { name: 'Bloquear kiosco' }))
    expect(screen.getByRole('button', { name: 'Bloquear kiosco' })).toBeDisabled()
    finish({ ok: true, data: undefined })
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
  })
  it('does not register or enable kiosks in an inactive branch', async () => {
    setup([{ ...kiosk, kio_estado: 'bloqueado' }], false)
    await userEvent.click(screen.getByText('Administrar kiosco'))
    expect(screen.getByRole('button', { name: 'Registrar kiosco' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Habilitar kiosco' })).toBeDisabled()
  })
})
