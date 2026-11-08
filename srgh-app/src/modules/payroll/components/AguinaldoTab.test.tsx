import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AguinaldoTab } from './AguinaldoTab'
import { pagarAguinaldo } from '@/modules/payroll/actions/pagarAguinaldo'
import { anularPagoExtraordinario } from '@/modules/payroll/actions/anularPagoExtraordinario'
import { reenviarComprobanteExtraordinario } from '@/modules/payroll/actions/reenviarComprobante'
import type { AguinaldoItem } from '@/modules/payroll/types'
import { toast } from 'sonner'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('@/modules/payroll/actions/pagarAguinaldo', () => ({ pagarAguinaldo: vi.fn() }))
vi.mock('@/modules/payroll/actions/anularPagoExtraordinario', () => ({
  anularPagoExtraordinario: vi.fn(),
}))
vi.mock('@/modules/payroll/actions/reenviarComprobante', () => ({
  reenviarComprobanteExtraordinario: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }))

const mockPagar = vi.mocked(pagarAguinaldo)

function item(over: Partial<AguinaldoItem> = {}): AguinaldoItem {
  return {
    historialLaboralId: 1,
    empleadoNombre: 'Ana Pérez',
    empleadoCedula: '1-2222-3333',
    empleadoEmail: 'ana@correo.com',
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
    anulableHasta: null,
    ultimaAnulacion: null,
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
    mockPagar.mockResolvedValue({
      ok: true,
      pagoId: 7,
      correo: { estado: 'enviado', email: 'ana@correo.com' },
    })
    renderTab([item({ historialLaboralId: 4 })], { correoConfigurado: true })

    await user.click(tabla().getByRole('button', { name: 'Pagar' }))
    // Antes de pagar pregunta, y dice adónde va el comprobante.
    const dialogo = screen.getByRole('alertdialog', {
      name: '¿Desea pagarle el aguinaldo a Ana Pérez?',
    })
    expect(dialogo).toHaveTextContent('se le enviará el comprobante en PDF a ana@correo.com')
    expect(mockPagar).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Sí, pagar' }))

    expect(mockPagar).toHaveBeenCalledWith(4, 2026)
    expect(refresh).toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalledWith(
      'Aguinaldo de Ana Pérez pagado. Comprobante enviado a ana@correo.com.'
    )
  })

  it('si cancela la confirmación no paga', async () => {
    const user = userEvent.setup()
    renderTab([item()], { correoConfigurado: true })

    await user.click(tabla().getByRole('button', { name: 'Pagar' }))
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(mockPagar).not.toHaveBeenCalled()
  })

  it('sin correo registrado lo avisa antes de pagar', async () => {
    const user = userEvent.setup()
    renderTab([item({ empleadoEmail: null })], { correoConfigurado: true })

    await user.click(tabla().getByRole('button', { name: 'Pagar' }))

    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'No tiene correo registrado en su expediente'
    )
  })

  it('si el correo falla avisa y "Reintentar" vuelve a mandar ESE comprobante', async () => {
    const user = userEvent.setup()
    mockPagar.mockResolvedValue({
      ok: true,
      pagoId: 7,
      correo: { estado: 'error', error: 'no se pudo conectar con el servidor de correo.' },
    })
    vi.mocked(reenviarComprobanteExtraordinario).mockResolvedValue({
      estado: 'enviado',
      email: 'ana@correo.com',
    })
    renderTab([item()], { correoConfigurado: true })

    await user.click(tabla().getByRole('button', { name: 'Pagar' }))
    await user.click(screen.getByRole('button', { name: 'Sí, pagar' }))

    const [mensaje, opciones] = vi.mocked(toast.warning).mock.calls[0]
    expect(mensaje).toBe(
      'Aguinaldo de Ana Pérez pagado, pero el comprobante no se pudo enviar: no se pudo conectar con el servidor de correo.'
    )
    ;(opciones as unknown as { action: { onClick: () => void } }).action.onClick()
    await vi.waitFor(() => expect(reenviarComprobanteExtraordinario).toHaveBeenCalledWith(7))
    await vi.waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Aguinaldo de Ana Pérez pagado. Comprobante enviado a ana@correo.com.'
      )
    )
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

describe('<AguinaldoTab /> nombre del aguinaldo', () => {
  it('se nombra por el año en que se paga, con lo que cubre', () => {
    renderTab([item()])

    expect(
      screen.getByRole('link', { name: /Aguinaldo 2026 · dic 2025 – nov 2026/ })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Aguinaldo 2025 · dic 2024 – nov 2025/ })
    ).toBeInTheDocument()
    expect(screen.queryByText(/Ciclo 2025-2026/)).not.toBeInTheDocument()
  })

  it('mientras se acumula, lo dice', () => {
    renderTab([item()], { cicloCerrado: false })

    expect(screen.getByText(/Todavía se está acumulando/)).toBeInTheDocument()
  })
})

describe('<AguinaldoTab /> aguinaldos del año anterior sin pagar', () => {
  it('avisa con cuántos, cuánto y el enlace', () => {
    renderTab([item()], {
      anio: 2027,
      anioActual: 2027,
      cicloCerrado: false,
      pendientesAnterior: { anio: 2026, cantidad: 3, monto: 1290000 },
    })

    const aviso = screen.getByRole('note')
    expect(aviso).toHaveTextContent('Quedan 3 empleado(s) con el aguinaldo 2026 sin pagar')
    expect(within(aviso).getByRole('link', { name: 'Ver aguinaldo 2026' })).toHaveAttribute(
      'href',
      '/payroll/aguinaldo-liquidacion?anio=2026'
    )
  })

  it('sin pendientes no hay aviso', () => {
    renderTab([item()], { pendientesAnterior: null })

    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  describe('anular un pago hecho por error', () => {
    const PAGADO = {
      pagado: true,
      pagoId: 70,
      fechaPago: '2026-12-10',
      anulableHasta: '2026-12-12T15:00:00.000Z',
    }

    it('pide el motivo y anula ESE pago', async () => {
      const user = userEvent.setup()
      vi.mocked(anularPagoExtraordinario).mockResolvedValue({ ok: true })
      renderTab([item(PAGADO)])

      await user.click(tabla().getByRole('button', { name: 'Anular' }))
      const dialogo = screen.getByRole('dialog', {
        name: '¿Anular el pago de aguinaldo 2026 de Ana Pérez?',
      })
      // 15:00 UTC = 09:00 en Costa Rica.
      expect(dialogo).toHaveTextContent('Se puede anular hasta el 12/12/2026 09:00')
      const confirmar = within(dialogo).getByRole('button', { name: 'Sí, anular el pago' })
      // Sin motivo no deja.
      expect(confirmar).toBeDisabled()

      await user.type(within(dialogo).getByLabelText('Motivo (obligatorio)'), 'Se pagó dos veces.')
      await user.click(confirmar)

      expect(anularPagoExtraordinario).toHaveBeenCalledWith(70, 'Se pagó dos veces.')
      expect(refresh).toHaveBeenCalled()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('si la base lo rechaza, muestra el motivo y deja el diálogo abierto', async () => {
      const user = userEvent.setup()
      vi.mocked(anularPagoExtraordinario).mockResolvedValue({
        ok: false,
        error: 'Ya pasó el plazo para anular este pago (48 horas desde que se registró).',
      })
      renderTab([item(PAGADO)])

      await user.click(tabla().getByRole('button', { name: 'Anular' }))
      await user.type(screen.getByLabelText('Motivo (obligatorio)'), 'Se pagó dos veces.')
      // Un refresh pendiente de otro test no cuenta.
      refresh.mockClear()
      await user.click(screen.getByRole('button', { name: 'Sí, anular el pago' }))

      expect(toast.error).toHaveBeenCalledWith(
        'Ya pasó el plazo para anular este pago (48 horas desde que se registró).'
      )
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(refresh).not.toHaveBeenCalled()
    })

    it('fuera del plazo, o sin permiso de escribir, no hay botón', () => {
      const { unmount } = renderTab([item({ ...PAGADO, anulableHasta: null })])
      expect(tabla().queryByRole('button', { name: 'Anular' })).not.toBeInTheDocument()
      unmount()
      renderTab([item(PAGADO)], { canWrite: false })
      expect(tabla().queryByRole('button', { name: 'Anular' })).not.toBeInTheDocument()
    })

    it('un pago anterior anulado queda a la vista', () => {
      renderTab([
        item({
          ultimaAnulacion: {
            fecha: '2026-12-10T18:00:00+00:00',
            por: 'Laura Vargas',
            motivo: 'Se pagó con quincenas sin marcar.',
          },
        }),
      ])
      expect(
        tabla().getByText(
          /Un pago anterior se anuló el 10\/12\/2026 12:00 \(Laura Vargas\): Se pagó con quincenas sin marcar\./
        )
      ).toBeInTheDocument()
    })
  })
})
