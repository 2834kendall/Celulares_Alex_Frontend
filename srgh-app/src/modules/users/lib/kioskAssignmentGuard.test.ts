import { beforeEach, describe, expect, it, vi } from 'vitest'
import { kioskAssignmentGuard } from './kioskAssignmentGuard'
import { createSupabaseAdminClientMock } from '@/test/supabaseMock'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePermission } from '@/lib/auth/require-permission'
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
beforeEach(() => vi.clearAllMocks())
describe('generic account management cannot bypass kiosk controls', () => {
  function admin(registered = false) {
    return createSupabaseAdminClientMock({
      sgrh_kioscos: { data: registered ? { kio_id: 'k' } : null, error: null },
      sgrh_cat_roles: { data: { rol_id: 13 }, error: null },
    }) as unknown as ReturnType<typeof createAdminClient>
  }
  it('rejects changes to an already registered kiosk', async () => {
    expect(await kioskAssignmentGuard(admin(true), { usrId: 2 })).toMatch(/Configuración/)
  })
  it('rejects generic invitations for the kiosk role', async () => {
    expect(await kioskAssignmentGuard(admin(), { rolId: 13, inviting: true })).toMatch(
      /Configuración/
    )
  })
  it('rejects an employee-linked or multi-branch legacy kiosk', async () => {
    expect(await kioskAssignmentGuard(admin(), { rolId: 13, sucursalIds: [10, 20] })).toMatch(
      /una sola sucursal/
    )
    expect(
      await kioskAssignmentGuard(admin(), { rolId: 13, sucursalIds: [10], empleadoId: 8 })
    ).toMatch(/empleado/)
  })
  it('requires branch administration when correcting a legacy kiosk assignment', async () => {
    expect(await kioskAssignmentGuard(admin(), { rolId: 13, sucursalIds: [10] })).toBeNull()
    expect(requirePermission).toHaveBeenCalledWith('EMPRESAS_WRITE')
  })
})
