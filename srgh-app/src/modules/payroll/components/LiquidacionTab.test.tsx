import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LiquidacionTab } from './LiquidacionTab'
import { procesarLiquidacion } from '@/modules/payroll/actions/procesarLiquidacion'
import { formatCRC } from '@/modules/payroll/lib/format'
import type { ContratoPorLiquidarItem, LiquidacionCalculada } from '@/modules/payroll/types'

let searchString = ''

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/payroll/aguinaldo-liquidacion',
  useSearchParams: () => new URLSearchParams(searchString),
}))

vi.mock('@/modules/payroll/actions/procesarLiquidacion', () => ({
  procesarLiquidacion: vi.fn(),
}))

// La propuesta de vacaciones y el pago son server actions con sus propios
// tests: acá devuelven lo mínimo para que el formulario funcione.
vi.mock('@/modules/payroll/actions/proponerVacacionesLiquidacion', () => ({
  proponerVacacionesLiquidacion: vi.fn(() => Promise.resolve({ ok: false, error: 'sin datos' })),
}))

vi.mock('@/modules/payroll/actions/pagarLiquidacion', () => ({
  pagarLiquidacion: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}))

const mockProcesar = vi.mocked(procesarLiquidacion)

const CONTRATOS: ContratoPorLiquidarItem[] = [
  {
    historialLaboralId: 5,
    nombre: 'Ana Mora',
    cedula: '1-1111-1111',
    fechaSalida: '2026-09-20',
    motivo: {
      codigo: 'REN001',
      nombre: 'Renuncia Voluntaria',
      generaCesantia: false,
      generaPreaviso: false,
      notaLegal: null,
    },

    tipoContrato: { codigo: 'INDEF', nombre: 'Contrato por Tiempo Indefinido' },
  },
  {
    historialLaboralId: 8,
    nombre: 'Luis Solís',
    cedula: '2-2222-2222',
    fechaSalida: '2026-09-15',
    motivo: {
      codigo: 'DES001',
      nombre: 'Despido con Responsabilidad Patronal',
      generaCesantia: true,
      generaPreaviso: true,
      notaLegal: null,
    },

    tipoContrato: { codigo: 'INDEF', nombre: 'Contrato por Tiempo Indefinido' },
  },
]

const CALCULO: LiquidacionCalculada = {
  liqId: null,
  salarioDiario: 10000,
  salarioDiarioVacaciones: 10000,
  diasSalarioPendiente: 15,
  salarioProporcional: 150000,
  aguinaldoProporcional: 100000,
  diasVacaciones: 5,
  vacacionesPagadas: 50000,
  horasExtraBanco: 0,
  diasPreaviso: 0,
  preaviso: 0,
  diasCesantia: 0,
  cesantia: 0,
  notaPreaviso: 'no aplica por el motivo de salida (Renuncia Voluntaria)',
  notaCesantia: 'no aplica por el motivo de salida (Renuncia Voluntaria)',
  diasIndemnizacionPlazoFijo: 0,
  indemnizacionPlazoFijo: 0,
  total: 300000,
  deduccionesObreras: 21660,
  neto: 278340,
  advertencias: ['Se liquidaron 0 día(s) de vacaciones; el sistema proponía 3.'],
}

function renderTab(contratos: ContratoPorLiquidarItem[] = CONTRATOS) {
  render(<LiquidacionTab contratos={contratos} historial={[]} />)
}

beforeEach(() => {
  vi.clearAllMocks()
  searchString = ''
})

describe('<LiquidacionTab /> — preselección por URL', () => {
  it('sin ?empleado= el selector arranca vacío', () => {
    renderTab()

    expect(screen.getByLabelText('Contrato por liquidar')).toHaveTextContent('Elegí un contrato')
  })

  it('con ?empleado= de un contrato por liquidar lo deja elegido', () => {
    searchString = 'tab=liquidacion&empleado=8'
    renderTab()

    expect(screen.getByLabelText('Contrato por liquidar')).toHaveTextContent(
      'Luis Solís — 2-2222-2222 · salió el 15/09/2026'
    )
  })

  // El id viaja en la URL: puede ser de alguien ya liquidado, fuera del alcance
  // de la RLS o escrito a mano. Nunca se preselecciona algo que no esté en la lista.
  it.each(['999', 'abc', '-5', '0', '5.5'])('ignora ?empleado=%s', (valor) => {
    searchString = `tab=liquidacion&empleado=${valor}`
    renderTab()

    expect(screen.getByLabelText('Contrato por liquidar')).toHaveTextContent('Elegí un contrato')
  })
})

describe('<LiquidacionTab /> — contrato terminado desde el perfil', () => {
  it('sin contratos por liquidar explica dónde se terminan', () => {
    renderTab([])

    expect(screen.getByText(/no hay contratos pendientes de liquidar/i)).toBeInTheDocument()
    expect(screen.getByText(/se terminan desde el perfil del empleado/i)).toBeInTheDocument()
  })

  it('muestra la fecha y el motivo que registró RRHH, sin dejarlos editar', () => {
    searchString = 'empleado=8'
    renderTab()

    expect(screen.getByText('15/09/2026')).toBeInTheDocument()
    expect(screen.getByText('Despido con Responsabilidad Patronal')).toBeInTheDocument()
    expect(screen.getByText(/genera cesantía\. genera preaviso\./i)).toBeInTheDocument()
    // Ya no hay campos para capturarlos.
    expect(screen.queryByLabelText('Fecha de salida')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Motivo de salida')).not.toBeInTheDocument()
  })

  it('Calcular muestra una vista previa y no guarda nada', async () => {
    const user = userEvent.setup()
    mockProcesar.mockResolvedValue({ ok: true, data: CALCULO })
    searchString = 'empleado=5'
    renderTab()

    await user.click(screen.getByRole('button', { name: 'Calcular liquidación' }))

    await waitFor(() =>
      expect(mockProcesar).toHaveBeenCalledWith(
        {
          historialLaboralId: 5,
          diasVacacionesPendientes: 0,
          cesantiaPactada: null,
          plazoSeisMesesOMas: null,
        },
        { soloCalcular: true }
      )
    )
    expect(await screen.findByText('Todavía no se guardó')).toBeInTheDocument()
    expect(screen.getByText(/proponía 3/)).toBeInTheDocument()
    expect(mockProcesar).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('guardar pide confirmación con el neto; cancelar no guarda', async () => {
    const user = userEvent.setup()
    mockProcesar.mockResolvedValue({ ok: true, data: CALCULO })
    searchString = 'empleado=5'
    renderTab()

    await user.click(screen.getByRole('button', { name: 'Calcular liquidación' }))
    await user.click(await screen.findByRole('button', { name: 'Guardar liquidación' }))
    const dialogo = await screen.findByRole('alertdialog')
    expect(dialogo).toHaveTextContent('Ana Mora')
    expect(dialogo).toHaveTextContent(formatCRC(278340).replace(/\s/g, ' '))

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(mockProcesar).toHaveBeenCalledTimes(1)
  })

  it('al confirmar guarda con el neto de la vista previa', async () => {
    const user = userEvent.setup()
    mockProcesar
      .mockResolvedValueOnce({ ok: true, data: CALCULO })
      .mockResolvedValueOnce({ ok: false, error: 'Este contrato ya fue liquidado.' })
    searchString = 'empleado=5'
    renderTab()

    await user.click(screen.getByRole('button', { name: 'Calcular liquidación' }))
    await user.click(await screen.findByRole('button', { name: 'Guardar liquidación' }))
    const dialogo = await screen.findByRole('alertdialog')
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar liquidación' }))

    await waitFor(() =>
      expect(mockProcesar).toHaveBeenLastCalledWith(
        {
          historialLaboralId: 5,
          diasVacacionesPendientes: 0,
          cesantiaPactada: null,
          plazoSeisMesesOMas: null,
        },
        { netoEsperado: 278340 }
      )
    )
    expect(await screen.findByText('Este contrato ya fue liquidado.')).toBeInTheDocument()
  })

  it('guardada, muestra el número de liquidación', async () => {
    const user = userEvent.setup()
    mockProcesar
      .mockResolvedValueOnce({ ok: true, data: CALCULO })
      .mockResolvedValueOnce({ ok: true, data: { ...CALCULO, liqId: 77 } })
    searchString = 'empleado=5'
    renderTab()

    await user.click(screen.getByRole('button', { name: 'Calcular liquidación' }))
    await user.click(await screen.findByRole('button', { name: 'Guardar liquidación' }))
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Guardar liquidación',
      })
    )

    expect(await screen.findByText('Liquidación guardada')).toBeInTheDocument()
    expect(screen.getByText('n.° 77')).toBeInTheDocument()
    expect(screen.queryByText('Todavía no se guardó')).not.toBeInTheDocument()
  })

  it('si cambian los días después de calcular, la vista previa se descarta', async () => {
    const user = userEvent.setup()
    mockProcesar.mockResolvedValue({ ok: true, data: CALCULO })
    searchString = 'empleado=5'
    renderTab()

    await user.click(screen.getByRole('button', { name: 'Calcular liquidación' }))
    expect(await screen.findByText('Todavía no se guardó')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Días de vacaciones pendientes'), '2')

    expect(screen.queryByText('Todavía no se guardó')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Guardar liquidación' })).not.toBeInTheDocument()
  })
})

describe('<LiquidacionTab /> — mutuo acuerdo', () => {
  const MUTUO: ContratoPorLiquidarItem = {
    historialLaboralId: 9,
    nombre: 'Fabián Rojas',
    cedula: '3-3333-3333',
    fechaSalida: '2026-09-10',
    motivo: {
      codigo: 'MUT001',
      nombre: 'Mutuo Acuerdo entre las Partes',
      generaCesantia: true,
      generaPreaviso: false,
      notaLegal: null,
    },
    tipoContrato: { codigo: 'INDEF', nombre: 'Contrato por Tiempo Indefinido' },
  }

  it('solo en mutuo acuerdo pregunta si se pactó la cesantía', () => {
    searchString = 'empleado=9'
    renderTab([...CONTRATOS, MUTUO])

    expect(screen.getByText('¿Se pactó pagar cesantía?')).toBeInTheDocument()
    expect(screen.getByText(/Cesantía solo si se pactó/)).toBeInTheDocument()
  })

  it('en otro motivo no pregunta', () => {
    searchString = 'empleado=8'
    renderTab([...CONTRATOS, MUTUO])

    expect(screen.queryByText('¿Se pactó pagar cesantía?')).not.toBeInTheDocument()
  })

  it('sin respuesta no calcula; con respuesta la manda', async () => {
    const user = userEvent.setup()
    mockProcesar.mockResolvedValue({ ok: false, error: 'stop' })
    searchString = 'empleado=9'
    renderTab([...CONTRATOS, MUTUO])

    await user.click(screen.getByRole('button', { name: 'Calcular liquidación' }))
    expect(await screen.findByText('Indicá si se pactó pagar cesantía.')).toBeInTheDocument()
    expect(mockProcesar).not.toHaveBeenCalled()

    await user.click(screen.getByLabelText('No se paga'))
    await user.click(screen.getByRole('button', { name: 'Calcular liquidación' }))

    await waitFor(() =>
      expect(mockProcesar).toHaveBeenCalledWith(
        {
          historialLaboralId: 9,
          diasVacacionesPendientes: 0,
          cesantiaPactada: 'no',
          plazoSeisMesesOMas: null,
        },
        { soloCalcular: true }
      )
    )
    expect(await screen.findByText('stop')).toBeInTheDocument()
  })
})

// Auditoría 2: contrato a plazo fijo terminado por el patrono (Art. 31).
describe('<LiquidacionTab /> — contrato a plazo fijo', () => {
  const PLAZO_FIJO: ContratoPorLiquidarItem = {
    historialLaboralId: 12,
    nombre: 'Beto Vargas',
    cedula: '4-4444-4444',
    fechaSalida: '2026-09-25',
    motivo: {
      codigo: 'DES001',
      nombre: 'Despido con Responsabilidad Patronal',
      generaCesantia: true,
      generaPreaviso: true,
      notaLegal: null,
    },
    tipoContrato: { codigo: 'PLAZO_FIJO', nombre: 'Contrato a Plazo Fijo' },
  }

  it('avisa que va la indemnización del Art. 31 y pide el plazo pactado', async () => {
    const user = userEvent.setup()
    mockProcesar.mockResolvedValue({ ok: false, error: 'stop' })
    searchString = 'empleado=12'
    renderTab([...CONTRATOS, PLAZO_FIJO])

    expect(screen.getByText(/indemnización del Art. 31/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Calcular liquidación' }))
    expect(
      await screen.findByText('Indicá si el contrato se pactó por seis meses o más.')
    ).toBeInTheDocument()
    expect(mockProcesar).not.toHaveBeenCalled()

    await user.click(screen.getByLabelText('Sí, seis meses o más'))
    await user.click(screen.getByRole('button', { name: 'Calcular liquidación' }))

    await waitFor(() =>
      expect(mockProcesar).toHaveBeenCalledWith(
        {
          historialLaboralId: 12,
          diasVacacionesPendientes: 0,
          cesantiaPactada: null,
          plazoSeisMesesOMas: 'si',
        },
        { soloCalcular: true }
      )
    )
  })

  it('un indefinido despedido no pregunta el plazo', () => {
    searchString = 'empleado=8'
    renderTab([...CONTRATOS, PLAZO_FIJO])

    expect(
      screen.queryByText('¿El contrato se pactó por seis meses o más?')
    ).not.toBeInTheDocument()
  })
})
