import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LiquidacionTab } from './LiquidacionTab'
import type { EmpleadoActivoItem, MotivoSalidaRow } from '@/modules/payroll/types'
import { procesarLiquidacion } from '@/modules/payroll/actions/procesarLiquidacion'

let searchString = ''

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/payroll/aguinaldo-liquidacion',
  useSearchParams: () => new URLSearchParams(searchString),
}))

vi.mock('@/modules/payroll/actions/procesarLiquidacion', () => ({
  procesarLiquidacion: vi.fn(),
}))

// La propuesta de vacaciones y el pago son server actions: acá solo importa
// la preselección por URL.
vi.mock('@/modules/payroll/actions/proponerVacacionesLiquidacion', () => ({
  proponerVacacionesLiquidacion: vi.fn(() => Promise.resolve({ ok: false, error: 'sin datos' })),
}))

vi.mock('@/modules/payroll/actions/pagarLiquidacion', () => ({
  pagarLiquidacion: vi.fn(),
}))

// El calendario propio no es un <input>: para escribir la fecha en los tests
// se cambia por uno nativo cableado igual (useController).
vi.mock('@/components/ui/ControlledDateField', async () => {
  const { useController } = await import('react-hook-form')
  return {
    ControlledDateField: ({
      control,
      name,
      id,
    }: {
      control: import('react-hook-form').Control<Record<string, unknown>>
      name: string
      id?: string
    }) => {
      const { field } = useController({ name, control })
      return (
        <input
          id={id}
          value={(field.value as string) ?? ''}
          onChange={(e) => field.onChange(e.target.value)}
        />
      )
    },
  }
})

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}))

const EMPLEADOS: EmpleadoActivoItem[] = [
  { historialLaboralId: 5, nombre: 'Ana Mora', cedula: '1-1111-1111' },
  { historialLaboralId: 8, nombre: 'Luis Solís', cedula: '2-2222-2222' },
]

function renderTab() {
  render(<LiquidacionTab empleados={EMPLEADOS} motivos={[]} historial={[]} />)
}

describe('<LiquidacionTab /> — preselección por URL', () => {
  beforeEach(() => {
    searchString = ''
  })

  it('sin ?empleado= el selector arranca vacío, como siempre', () => {
    renderTab()

    expect(screen.getByLabelText('Empleado')).toHaveTextContent('Elegí un empleado')
  })

  it('con ?empleado= de un contrato liquidable lo deja elegido', () => {
    searchString = 'tab=liquidacion&empleado=8'
    renderTab()

    expect(screen.getByLabelText('Empleado')).toHaveTextContent('Luis Solís — 2-2222-2222')
  })

  // El id viaja en la URL: puede ser de alguien ya liquidado, fuera del alcance
  // de la RLS o escrito a mano. Nunca se preselecciona algo que no esté en la lista.
  it.each(['999', 'abc', '-5', '0', '5.5'])('ignora ?empleado=%s', (valor) => {
    searchString = `tab=liquidacion&empleado=${valor}`
    renderTab()

    expect(screen.getByLabelText('Empleado')).toHaveTextContent('Elegí un empleado')
  })
})

describe('<LiquidacionTab /> — mutuo acuerdo', () => {
  const MOTIVOS = [
    {
      mot_id: 4,
      mot_codigo: 'MUT001',
      mot_nombre: 'Mutuo Acuerdo entre las Partes',
      mot_genera_cesantia: true,
      mot_genera_preaviso: false,
      mot_nota_legal: null,
    },
    {
      mot_id: 1,
      mot_codigo: 'REN001',
      mot_nombre: 'Renuncia Voluntaria',
      mot_genera_cesantia: false,
      mot_genera_preaviso: false,
      mot_nota_legal: null,
    },
  ] as unknown as MotivoSalidaRow[]

  beforeEach(() => {
    searchString = 'empleado=5'
    vi.mocked(procesarLiquidacion).mockReset()
  })

  async function elegirMotivo(user: ReturnType<typeof userEvent.setup>, nombre: string) {
    await user.click(screen.getByLabelText('Motivo de salida'))
    // El click va al botón de la opción (el <li> no escucha clicks).
    await user.click(within(screen.getByRole('option', { name: nombre })).getByRole('button'))
  }

  it('pregunta si se pactó la cesantía solo en mutuo acuerdo', async () => {
    const user = userEvent.setup()
    render(<LiquidacionTab empleados={EMPLEADOS} motivos={MOTIVOS} historial={[]} />)

    await elegirMotivo(user, 'Mutuo Acuerdo entre las Partes')
    expect(screen.getByText('¿Se pactó pagar cesantía?')).toBeInTheDocument()
    expect(screen.getByText(/Cesantía solo si se pactó/)).toBeInTheDocument()
  })

  it('en otro motivo no pregunta', async () => {
    const user = userEvent.setup()
    render(<LiquidacionTab empleados={EMPLEADOS} motivos={MOTIVOS} historial={[]} />)

    await elegirMotivo(user, 'Renuncia Voluntaria')
    expect(screen.queryByText('¿Se pactó pagar cesantía?')).not.toBeInTheDocument()
    expect(screen.getByText(/No genera cesantía/)).toBeInTheDocument()
  })

  it('no envía la liquidación sin la respuesta, y la manda cuando se elige', async () => {
    const user = userEvent.setup()
    vi.mocked(procesarLiquidacion).mockResolvedValue({ ok: false, error: 'stop' })
    render(<LiquidacionTab empleados={EMPLEADOS} motivos={MOTIVOS} historial={[]} />)

    fireEvent.change(screen.getByLabelText('Fecha de salida'), {
      target: { value: '2026-01-20' },
    })
    await elegirMotivo(user, 'Mutuo Acuerdo entre las Partes')
    await user.click(screen.getByRole('button', { name: /Calcular y guardar liquidación/ }))

    expect(await screen.findByText('Indicá si se pactó pagar cesantía.')).toBeInTheDocument()
    expect(procesarLiquidacion).not.toHaveBeenCalled()

    await user.click(screen.getByLabelText('No se paga'))
    await user.click(screen.getByRole('button', { name: /Calcular y guardar liquidación/ }))

    await waitFor(() =>
      expect(procesarLiquidacion).toHaveBeenCalledWith(
        expect.objectContaining({ motivoSalidaId: 4, cesantiaPactada: 'no' })
      )
    )
  })
})
