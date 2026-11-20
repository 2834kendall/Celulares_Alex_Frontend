import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { PeriodoForm } from './PeriodoForm'
import { createPeriodo } from '@/modules/payroll/actions/createPeriodo'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  usePathname: () => '/payroll/nuevo',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock('@/modules/payroll/actions/createPeriodo', () => ({ createPeriodo: vi.fn() }))

const CREADO = {
  ok: true as const,
  periodoId: 7,
  empleadosCargados: 3,
  sinAsistencia: 0,
  avisoCarga: null,
}

describe('PeriodoForm: aviso al crear el periodo de toda la empresa', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  async function crear() {
    render(<PeriodoForm sucursales={[]} porEmpresa />)
    await userEvent.click(screen.getByRole('button', { name: /Crear/ }))
  }

  it('una cuenta de sucursal sabe que solo se cargó su gente', async () => {
    vi.mocked(createPeriodo).mockResolvedValue({ ...CREADO, soloSusSucursales: true })

    await crear()

    expect(toast.info).toHaveBeenCalledWith(
      expect.stringContaining('solo se cargó la gente de tus')
    )
    expect(push).toHaveBeenCalledWith('/payroll/7')
  })

  it('una cuenta de toda la empresa no ve ese aviso', async () => {
    vi.mocked(createPeriodo).mockResolvedValue(CREADO)

    await crear()

    expect(toast.info).not.toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith('/payroll/7')
  })
})
