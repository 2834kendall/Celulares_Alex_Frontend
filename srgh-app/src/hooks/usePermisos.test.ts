import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { usePermisos } from './usePermisos'
import { createClient } from '@/lib/supabase/client'
import { PERMISOS } from '@/lib/permissions/catalog'

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(),
}))

const mockCreateClient = vi.mocked(createClient)

type SupabaseBrowserClient = ReturnType<typeof createClient>

const unsubscribe = vi.fn()
let authChangeCallback: (() => void) | null = null

function mockClient(claims: Record<string, unknown> | null) {
  const getClaims = vi.fn().mockResolvedValue({ data: claims ? { claims } : null })
  const client = {
    auth: {
      getClaims,
      onAuthStateChange: vi.fn((callback: () => void) => {
        authChangeCallback = callback
        return { data: { subscription: { unsubscribe } } }
      }),
    },
  }
  mockCreateClient.mockReturnValue(client as unknown as SupabaseBrowserClient)
  return { getClaims }
}

describe('usePermisos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authChangeCallback = null
  })

  it('carga permisos y userId desde los claims del JWT', async () => {
    mockClient({ sub: 'user-123', app_metadata: { permisos: [PERMISOS.EMPLEADOS_READ] } })

    const { result } = renderHook(() => usePermisos())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.permisos).toEqual([PERMISOS.EMPLEADOS_READ])
    expect(result.current.userId).toBe('user-123')
  })

  it('queda vacio cuando no hay sesion', async () => {
    mockClient(null)

    const { result } = renderHook(() => usePermisos())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.permisos).toEqual([])
    expect(result.current.userId).toBeNull()
  })

  it('queda vacio cuando permisos no es array o falta sub', async () => {
    mockClient({ app_metadata: { permisos: 'nope' } })

    const { result } = renderHook(() => usePermisos())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.permisos).toEqual([])
    expect(result.current.userId).toBeNull()
  })

  it('tiene y tieneCualquiera evaluan contra los permisos cargados', async () => {
    mockClient({
      sub: 'u1',
      app_metadata: { permisos: [PERMISOS.EMPLEADOS_READ, PERMISOS.NOMINA_READ] },
    })

    const { result } = renderHook(() => usePermisos())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.tiene(PERMISOS.EMPLEADOS_READ)).toBe(true)
    expect(result.current.tiene(PERMISOS.ROLES_WRITE)).toBe(false)
    expect(result.current.tieneCualquiera([PERMISOS.ROLES_WRITE, PERMISOS.NOMINA_READ])).toBe(true)
    expect(result.current.tieneCualquiera([PERMISOS.ROLES_WRITE])).toBe(false)
  })

  it('relee los claims cuando cambia el estado de autenticacion', async () => {
    const { getClaims } = mockClient({ sub: 'u1', app_metadata: { permisos: [] } })

    const { result } = renderHook(() => usePermisos())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.permisos).toEqual([])

    // Simula un nuevo login con permisos frescos en el token
    getClaims.mockResolvedValue({
      data: { claims: { sub: 'u1', app_metadata: { permisos: [PERMISOS.NOMINA_READ] } } },
    })
    authChangeCallback?.()

    await waitFor(() => expect(result.current.permisos).toEqual([PERMISOS.NOMINA_READ]))
  })

  it('cancela la suscripcion al desmontar', async () => {
    mockClient(null)

    const { result, unmount } = renderHook(() => usePermisos())
    await waitFor(() => expect(result.current.loading).toBe(false))

    unmount()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})
