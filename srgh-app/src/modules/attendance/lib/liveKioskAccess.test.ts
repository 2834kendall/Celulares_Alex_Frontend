import { beforeEach, describe, expect, it, vi } from 'vitest'
import { liveKioskMetadata } from './liveKioskAccess'
import { createAdminClient } from '@/lib/supabase/admin'
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
const rpc = vi.fn()
const old = {
  rol: 'KIOSCO',
  empresa_id: 1,
  usr_id: 999,
  sucursal_ids: [99],
  permisos: ['ASISTENCIA_KIOSCO'],
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(createAdminClient).mockReturnValue({ rpc } as unknown as ReturnType<
    typeof createAdminClient
  >)
})
describe('live kiosk authorization', () => {
  it('replaces stale branch/user claims with live state', async () => {
    rpc.mockResolvedValue({
      data: { usr_id: 2, sucursal_ids: [10], kiosk_context: '1:10:k:3' },
      error: null,
    })
    expect(await liveKioskMetadata('auth-id', old)).toMatchObject({
      usr_id: 2,
      sucursal_ids: [10],
      kiosk_context: '1:10:k:3',
    })
    expect(rpc).toHaveBeenCalledWith('sgrh_kiosk_context', { p_auth: 'auth-id', p_empresa: 1 })
  })
  it('denies a blocked account even if its signed JWT still grants the permission', async () => {
    rpc.mockResolvedValue({ data: { error: 'Kiosco bloqueado' }, error: null })
    expect(await liveKioskMetadata('auth-id', old)).toMatchObject({
      sucursal_ids: [],
      kiosk_denied: true,
      kiosk_error: 'Kiosco bloqueado',
    })
  })
  it('treats database failures as retryable, never as permission to proceed', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'unavailable' } })
    expect(await liveKioskMetadata('auth-id', old)).toMatchObject({
      sucursal_ids: [],
      kiosk_denied: false,
    })
  })
  it('does not silently authorize malformed RPC output', async () => {
    rpc.mockResolvedValue({ data: { sucursal_ids: [], kiosk_context: 'wrong' }, error: null })
    expect(await liveKioskMetadata('auth-id', old)).toMatchObject({
      sucursal_ids: [],
      kiosk_denied: true,
    })
  })
  it('validates the manager preview against live state too', async () => {
    const manager = {
      rol: 'GERENTE',
      empresa_id: 1,
      sucursal_ids: [10],
      permisos: ['ASISTENCIA_WRITE'],
    }
    rpc.mockResolvedValue({
      data: { usr_id: 4, sucursal_ids: [10], kiosk_context: '1:operator:4:10' },
      error: null,
    })
    expect(await liveKioskMetadata('manager', manager)).toMatchObject({
      sucursal_ids: [10],
      kiosk_context: '1:operator:4:10',
    })
    expect(rpc).toHaveBeenCalled()
  })
})
