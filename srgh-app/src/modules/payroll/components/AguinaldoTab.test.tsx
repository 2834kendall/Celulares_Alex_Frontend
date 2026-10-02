import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AguinaldoTab } from './AguinaldoTab'
import { pagarAguinaldo } from '@/modules/payroll/actions/pagarAguinaldo'
import type { AguinaldoItem } from '@/modules/payroll/types'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('@/modules/payroll/actions/pagarAguinaldo', () => ({ pagarAguinaldo: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const mockPagar = vi.mocked(pagarAguinaldo)

function item(over: Partial<AguinaldoItem> = {}): AguinaldoItem {
  return {
    historialLaboralId: 1,
    empleadoNombre: 'Ana Pérez',
    empleadoCedula: '1-2222-3333',
    anio: 2026,
    monto: 430000,
    maternidad: 0,
    elegible: true,
    quincenasSinPagar: [],
    ausenciasSinTipo: 0,
    sucursalesOcultas: false,
    pagado: false,
    fechaPago: null,
    pagoId: null,
    fechaSalida: null,
    ...over,
  }
}

function renderTab(items: AguinaldoItem[], over: Partial<Parameters<typeof AguinaldoTab>[0]> = {}) {
  return render(
    <AguinaldoTab
      anio={2026}
      anioActual={2026}
      items={items}
      canWrite
      cicloCerrado
      puedeLeerAusencias
      {...over}
    />
  )
}

/** La tabla (escritorio): jsdom rinde las dos vistas. */
function tabla() {
  return within(screen.getByRole('table'))
}

describe('<AguinaldoTab />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('con el ciclo cerrado y todo en orden, deja pagar y paga ESE empleado y ciclo', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mockPagar.mockResolvedValue({ ok: true, pagoId: 7 })
    renderTab([item({ historialLaboralId: 4 })])

    await user.click(tabla().getByRole('button', { name: 'Pagar' }))

    expect(mockPagar).toHaveBeenCalledWith(4, 2026)
    expect(refresh).toHaveBeenCalled()
  })

  it('con el ciclo abierto no deja pagar y dice "En curso"', () => {
    renderTab([item()], { cicloCerrado: false })

    expect(tabla().queryByRole('button', { name: 'Pagar' })).not.toBeInTheDocument()
    expect(tabla().getByText('En curso')).toBeInTheDocument()
  })

  it('sin el mes mínimo: "No le corresponde" y sin botón', () => {
    renderTab([item({ elegible: false, monto: 0 })])

    expect(tabla().getByText('No le corresponde')).toBeInTheDocument()
    expect(tabla().queryByRole('button', { name: 'Pagar' })).not.toBeInTheDocument()
  })

  it('con quincenas sin pagar no deja pagar y las nombra', () => {
    renderTab([item({ quincenasSinPagar: ['Noviembre 2026 · 2ª quincena'] })])

    expect(tabla().queryByRole('button', { name: 'Pagar' })).not.toBeInTheDocument()
    expect(tabla().getByText(/Noviembre 2026 · 2ª quincena/)).toBeInTheDocument()
  })

  it('sin permiso de ausencias avisa y no deja pagar', () => {
    renderTab([item()], { puedeLeerAusencias: false })

    expect(screen.getByText(/AUSENCIAS_READ/)).toBeInTheDocument()
    expect(tabla().queryByRole('button', { name: 'Pagar' })).not.toBeInTheDocument()
  })

  it('pagado: muestra el comprobante en vez del botón', () => {
    renderTab([item({ pagado: true, pagoId: 30, fechaPago: '2026-12-10' })])

    expect(tabla().getByRole('link', { name: /Comprobante/ })).toHaveAttribute(
      'href',
      '/comprobante/extraordinario/30'
    )
    expect(tabla().getByText('Pagado')).toBeInTheDocument()
  })

  // El servidor rechaza estos dos casos: el botón no puede ofrecer un pago
  // que después falla.
  it('con ausencias sin tipo legible no deja pagar y lo dice', () => {
    renderTab([item({ ausenciasSinTipo: 2 })])

    expect(tabla().queryByRole('button', { name: 'Pagar' })).not.toBeInTheDocument()
    expect(tabla().getByText(/2 ausencia\(s\) sin tipo legible/)).toBeInTheDocument()
  })

  it('con contratos en una sucursal que el usuario no ve no deja pagar y lo dice', () => {
    renderTab([item({ sucursalesOcultas: true })])

    expect(tabla().queryByRole('button', { name: 'Pagar' })).not.toBeInTheDocument()
    expect(tabla().getByText(/sucursal que tu usuario no ve/)).toBeInTheDocument()
  })

  it('pagado con el botón viejo: aclara que el monto no es uno registrado', () => {
    renderTab([item({ pagado: true, pagoId: null, fechaPago: '2025-12-10' })])

    expect(
      tabla().getByText(/sin comprobante: el monto mostrado es el calculado/)
    ).toBeInTheDocument()
  })

  it('dice cuánto viene de la licencia de maternidad', () => {
    renderTab([item({ maternidad: 1720000 })])

    expect(tabla().getByText(/licencia de maternidad/)).toBeInTheDocument()
  })
})
