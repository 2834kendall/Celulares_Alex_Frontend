import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requireAnyPermission, requirePermission } from './require-permission'
import { createClient } from '@/lib/supabase/server'
import { PERMISOS } from '@/lib/permissions/catalog'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))

const mockCreateClient = vi.mocked(createClient)

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

function mockClaims(claims: Record<string, unknown> | null, error: Error | null = null) {
  mockCreateClient.mockResolvedValue({
    auth: {
      getClaims: vi.fn().mockResolvedValue({ data: claims ? { claims } : null, error }),
    },
  } as unknown as SupabaseServerClient)
}

describe('requirePermission', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redirige a /login si getClaims devuelve error', async () => {
    mockClaims({ app_metadata: { permisos: [PERMISOS.EMPLEADOS_READ] } }, new Error('bad jwt'))
    await expect(requirePermission(PERMISOS.EMPLEADOS_READ)).rejects.toThrow('NEXT_REDIRECT:/login')
  })

  it('redirige a /login si no hay claims (sin sesion)', async () => {
    mockClaims(null)
    await expect(requirePermission(PERMISOS.EMPLEADOS_READ)).rejects.toThrow('NEXT_REDIRECT:/login')
  })

  it('redirige a /unauthorized si el JWT no trae app_metadata', async () => {
    mockClaims({ sub: 'abc' })
    await expect(requirePermission(PERMISOS.EMPLEADOS_READ)).rejects.toThrow(
      'NEXT_REDIRECT:/unauthorized'
    )
  })

  it('redirige a /unauthorized si permisos no es un array', async () => {
    mockClaims({ app_metadata: { permisos: 'nope' } })
    await expect(requirePermission(PERMISOS.EMPLEADOS_READ)).rejects.toThrow(
      'NEXT_REDIRECT:/unauthorized'
    )
  })

  it('redirige a /unauthorized si falta el permiso requerido', async () => {
    mockClaims({ app_metadata: { permisos: [PERMISOS.NOMINA_READ] } })
    await expect(requirePermission(PERMISOS.EMPLEADOS_READ)).rejects.toThrow(
      'NEXT_REDIRECT:/unauthorized'
    )
  })

  it('devuelve los claims cuando el permiso esta presente', async () => {
    const claims = { sub: 'abc', app_metadata: { permisos: [PERMISOS.EMPLEADOS_READ] } }
    mockClaims(claims)
    await expect(requirePermission(PERMISOS.EMPLEADOS_READ)).resolves.toEqual(claims)
  })
})

describe('requireAnyPermission', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redirige a /login si no hay sesion', async () => {
    mockClaims(null)
    await expect(
      requireAnyPermission([PERMISOS.ASISTENCIA_READ, PERMISOS.ASISTENCIA_WRITE])
    ).rejects.toThrow('NEXT_REDIRECT:/login')
  })

  it('redirige a /unauthorized si no tiene ninguno de los permisos', async () => {
    mockClaims({ app_metadata: { permisos: [PERMISOS.NOMINA_READ] } })
    await expect(
      requireAnyPermission([PERMISOS.ASISTENCIA_READ, PERMISOS.ASISTENCIA_WRITE])
    ).rejects.toThrow('NEXT_REDIRECT:/unauthorized')
  })

  it('devuelve los claims cuando tiene al menos uno de los permisos', async () => {
    const claims = { sub: 'abc', app_metadata: { permisos: [PERMISOS.ASISTENCIA_WRITE] } }
    mockClaims(claims)
    await expect(
      requireAnyPermission([PERMISOS.ASISTENCIA_READ, PERMISOS.ASISTENCIA_WRITE])
    ).resolves.toEqual(claims)
  })
})
