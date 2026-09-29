import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EmployeeContractActions, liquidacionHref } from './EmployeeContractActions'
import { HISTORIAL_ACTIVO, HISTORIAL_CERRADO } from './testFixtures'
import { revertContractTermination } from '@/modules/employees/actions/revertContractTermination'
import type { ContratoDetalle } from '@/modules/employees/types'

const refresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('@/modules/employees/actions/createContract', () => ({ createContract: vi.fn() }))
vi.mock('@/modules/employees/actions/updateContract', () => ({ updateContract: vi.fn() }))
vi.mock('@/modules/employees/actions/terminateContract', () => ({ terminateContract: vi.fn() }))
vi.mock('@/modules/employees/actions/revertContractTermination', () => ({
  revertContractTermination: vi.fn(),
}))

const mockRevertir = vi.mocked(revertContractTermination)

const CATALOGOS = {
  puestos: [{ id: 3, nombre: 'Cajera' }],
  sucursales: [{ id: 2, nombre: 'Central' }],
  tiposContrato: [{ id: 1, nombre: 'Indefinido' }],
  tiposJornada: [{ id: 1, nombre: 'Diurna' }],
}

const MOTIVOS = [
  {
    id: 1,
    nombre: 'Renuncia Voluntaria',
    generaCesantia: false,
    generaPreaviso: false,
    notaLegal: null,
  },
]

/** El último contrato, terminado y todavía sin liquidar. */
const TERMINADO_SIN_LIQUIDAR: ContratoDetalle = {
  ...HISTORIAL_ACTIVO,
  lab_fecha_fin: '2026-09-20',
  lab_motivo_salida_id: 1,
  motivo_salida_nombre: 'Renuncia Voluntaria',
  liquidado: false,
}

/** Vigente con una terminación programada (preaviso). */
const PROGRAMADO: ContratoDetalle = {
  ...HISTORIAL_ACTIVO,
  lab_fecha_fin_programada: '2026-10-15',
  lab_motivo_salida_id: 1,
  motivo_salida_nombre: 'Renuncia Voluntaria',
}

function renderActions(
  contratos: ContratoDetalle[],
  permisos: { canLiquidar?: boolean; canEditContrato?: boolean } = {}
) {
  return render(
    <EmployeeContractActions
      empId={10}
      contratos={contratos}
      canLiquidar={permisos.canLiquidar ?? false}
      canEditContrato={permisos.canEditContrato ?? false}
      catalogos={CATALOGOS}
      motivos={MOTIVOS}
    />
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('<EmployeeContractActions /> — botones por estado y permiso', () => {
  it('sin permisos de escritura no ofrece ninguna acción', () => {
    renderActions([HISTORIAL_ACTIVO])

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('vigente sin planilla: Editar y Terminar', () => {
    renderActions([HISTORIAL_ACTIVO], { canEditContrato: true })

    expect(screen.getByRole('button', { name: /editar/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /terminar/i })).toBeEnabled()
  })

  it('vigente que ya pasó por planilla: Editar deshabilitado, Terminar disponible', () => {
    renderActions([{ ...HISTORIAL_ACTIVO, en_planilla: true }], { canEditContrato: true })

    expect(screen.getByRole('button', { name: /editar/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /terminar/i })).toBeEnabled()
  })

  it('terminación programada: solo Revertir', () => {
    renderActions([PROGRAMADO], { canEditContrato: true })

    expect(screen.getByRole('button', { name: /revertir terminación/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /editar/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^terminar$/i })).not.toBeInTheDocument()
  })

  it('terminado sin liquidar: Revertir y Nuevo contrato deshabilitado', () => {
    renderActions([TERMINADO_SIN_LIQUIDAR], { canEditContrato: true })

    expect(screen.getByRole('button', { name: /revertir terminación/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /nuevo contrato/i })).toBeDisabled()
    // Liquidar es de NOMINA_WRITE.
    expect(screen.queryByRole('link', { name: /liquidar/i })).not.toBeInTheDocument()
  })

  it('terminado sin liquidar, con NOMINA_WRITE: enlaza a liquidar ese contrato', () => {
    renderActions([TERMINADO_SIN_LIQUIDAR], { canLiquidar: true })

    expect(screen.getByRole('link', { name: /liquidar/i })).toHaveAttribute(
      'href',
      '/payroll/aguinaldo-liquidacion?tab=liquidacion&empleado=5'
    )
    // Sin HISTORIAL_WRITE no se revierte ni se crea.
    expect(screen.queryByRole('button', { name: /revertir/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /nuevo contrato/i })).not.toBeInTheDocument()
  })

  it('sin vigente y con todo liquidado: Nuevo contrato abre el formulario', async () => {
    const user = userEvent.setup()
    renderActions([HISTORIAL_CERRADO], { canEditContrato: true })

    await user.click(screen.getByRole('button', { name: /nuevo contrato/i }))

    expect(screen.getByRole('dialog', { name: 'Nuevo contrato' })).toBeInTheDocument()
  })

  it('Editar muestra la sucursal como texto, no como campo', async () => {
    const user = userEvent.setup()
    renderActions([HISTORIAL_ACTIVO], { canEditContrato: true })

    await user.click(screen.getByRole('button', { name: /editar/i }))

    const dialogo = screen.getByRole('dialog', { name: 'Editar contrato' })
    expect(within(dialogo).queryByLabelText('Sucursal *')).not.toBeInTheDocument()
    expect(within(dialogo).getByText('Central')).toBeInTheDocument()
  })

  it('Revertir pide confirmación y revierte el contrato terminado', async () => {
    const user = userEvent.setup()
    mockRevertir.mockResolvedValue({ ok: true })
    renderActions([TERMINADO_SIN_LIQUIDAR], { canEditContrato: true })

    await user.click(screen.getByRole('button', { name: /revertir terminación/i }))
    expect(mockRevertir).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Revertir' }))

    await waitFor(() => expect(mockRevertir).toHaveBeenCalledWith(5))
    expect(refresh).toHaveBeenCalled()
  })
})

describe('liquidacionHref', () => {
  it('arma el deep-link al tab de liquidación', () => {
    expect(liquidacionHref(42)).toBe('/payroll/aguinaldo-liquidacion?tab=liquidacion&empleado=42')
  })
})
