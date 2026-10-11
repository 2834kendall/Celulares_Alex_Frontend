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

  // Antes se bloqueaba porque la planilla leía el salario en vivo. Desde que
  // cada fila guarda la foto del contrato, un período ya calculado conserva
  // sus montos y la edición aplica desde el siguiente.
  it('vigente que ya pasó por planilla: Editar sigue disponible', () => {
    renderActions([{ ...HISTORIAL_ACTIVO, en_planilla: true }], { canEditContrato: true })

    expect(screen.getByRole('button', { name: /editar/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /terminar/i })).toBeEnabled()
  })

  it('al editar un contrato que ya pasó por planilla avisa desde cuándo aplica', async () => {
    const user = userEvent.setup()
    renderActions([{ ...HISTORIAL_ACTIVO, en_planilla: true }], { canEditContrato: true })

    await user.click(screen.getByRole('button', { name: /editar/i }))

    const dialogo = within(screen.getByRole('dialog', { name: 'Editar contrato' }))
    expect(dialogo.getByText(/aplican desde el próximo período/i)).toBeInTheDocument()
  })

  it('al editar un contrato sin planilla no aparece el aviso', async () => {
    const user = userEvent.setup()
    renderActions([HISTORIAL_ACTIVO], { canEditContrato: true })

    await user.click(screen.getByRole('button', { name: /editar/i }))

    const dialogo = within(screen.getByRole('dialog', { name: 'Editar contrato' }))
    expect(dialogo.queryByText(/aplican desde el próximo período/i)).not.toBeInTheDocument()
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

  it('Editar deja cambiar la sucursal base', async () => {
    const user = userEvent.setup()
    renderActions([HISTORIAL_ACTIVO], { canEditContrato: true })

    await user.click(screen.getByRole('button', { name: /editar/i }))

    const dialogo = screen.getByRole('dialog', { name: 'Editar contrato' })
    expect(within(dialogo).getByLabelText('Sucursal *')).toBeInTheDocument()
  })

  // El diálogo tiene que abrir con TODO lo que ya tiene el contrato. Pasó al
  // volver la sucursal editable: no estaba en defaultValues (antes no hacía
  // falta) y el select abría vacío, obligando a elegirla de nuevo en cada
  // corrección de salario. El test del formulario no lo agarró porque recibe
  // un fixture completo; este monta el cableado real.
  it('Editar precarga lo que ya tiene el contrato', async () => {
    const user = userEvent.setup()
    renderActions([HISTORIAL_ACTIVO], { canEditContrato: true })

    await user.click(screen.getByRole('button', { name: /editar/i }))

    const dialogo = within(screen.getByRole('dialog', { name: 'Editar contrato' }))
    expect(dialogo.getByLabelText('Sucursal *')).toHaveTextContent('Central')
    expect(dialogo.getByLabelText('Puesto *')).toHaveTextContent('Cajera')
    expect(dialogo.getByLabelText('Tipo de contrato *')).toHaveTextContent('Indefinido')
    expect(dialogo.getByLabelText('Tipo de jornada *')).toHaveTextContent('Diurna')
  })

  it('con una quincena sin pagar, la sucursal sale como texto con el motivo', async () => {
    const user = userEvent.setup()
    renderActions([{ ...HISTORIAL_ACTIVO, quincena_sin_pagar: true }], { canEditContrato: true })

    await user.click(screen.getByRole('button', { name: /editar/i }))

    const dialogo = within(screen.getByRole('dialog', { name: 'Editar contrato' }))
    expect(dialogo.queryByLabelText('Sucursal *')).not.toBeInTheDocument()
    expect(dialogo.getByText(/quincena sin pagar/i)).toBeInTheDocument()
  })

  it('Revertir pide confirmación y revierte el contrato terminado', async () => {
    const user = userEvent.setup()
    mockRevertir.mockResolvedValue({ ok: true })
    renderActions([TERMINADO_SIN_LIQUIDAR], { canEditContrato: true })

    await user.click(screen.getByRole('button', { name: /revertir terminación/i }))
    expect(mockRevertir).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Revertir' }))

    await waitFor(() => expect(mockRevertir).toHaveBeenCalledWith(5))
    expect(refresh).not.toHaveBeenCalled()
  })
})

describe('liquidacionHref', () => {
  it('arma el deep-link al tab de liquidación', () => {
    expect(liquidacionHref(42)).toBe('/payroll/aguinaldo-liquidacion?tab=liquidacion&empleado=42')
  })
})
