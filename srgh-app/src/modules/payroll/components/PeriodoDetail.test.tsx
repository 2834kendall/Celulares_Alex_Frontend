import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PeriodoDetail } from './PeriodoDetail'
import { formatCRC } from '@/modules/payroll/lib/format'
import type { DetalleNominaItem, PeriodoDetalle } from '@/modules/payroll/types'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/payroll/7',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }))
// Server actions: acá no se ejecutan, solo se pinta la pantalla.
vi.mock('@/modules/payroll/actions/marcarDetallePagado', () => ({ marcarDetallePagado: vi.fn() }))
vi.mock('@/modules/payroll/actions/refrescarHorasAsistencia', () => ({
  refrescarHorasAsistencia: vi.fn(),
}))
vi.mock('@/modules/payroll/actions/recalcularPeriodoDesdeAsistencia', () => ({
  recalcularPeriodoDesdeAsistencia: vi.fn(),
}))
vi.mock('@/modules/payroll/actions/cargarEmpleadosDesdeAsistencia', () => ({
  cargarEmpleadosDesdeAsistencia: vi.fn(),
}))
vi.mock('./DetalleEditForm', () => ({ DetalleEditForm: () => null }))
vi.mock('./RegistrarIncapacidadForm', () => ({ RegistrarIncapacidadForm: () => null }))

function fila(over: Partial<DetalleNominaItem>): DetalleNominaItem {
  return {
    id: 1,
    historialLaboralId: 1,
    empleadoNombre: 'Ana Mora',
    empleadoCedula: '1-1111-1111',
    salarioBruto: 400000,
    totalNoSalarial: 0,
    totalDeducciones: 43320,
    deduccionPorcentual: 43320,
    deduccionManual: 0,
    cargasPatronales: 100000,
    salarioNeto: 356680,
    pagado: false,
    fechaPago: null,
    liquidacionQueLaPaga: null,
    codigoVerificacion: null,
    diasPorRevisar: [],
    montosPorConcepto: {},
    horasTrabajadas: 88,
    horasExtra: 0,
    salarioPorHora: 2500,
    horasOrigen: 'asistencia',
    horasAsistencia: 88,
    horasExtraAsistencia: 0,
    horasLeidasEn: null,
    horasAjustadasEn: null,
    marcasCambiaron: false,
    horasAsistenciaAhora: null,
    baseDesactualizado: false,
    baseEsperado: null,
    ajusteEsperado: null,
    dias: [],
    incapacidad: null,
    totalAPagar: 356680,
    numeroCuenta: null,
    bancoNombre: null,
    cuentaIlegible: false,
    ...over,
  }
}

function periodo(detalles: DetalleNominaItem[], over: Partial<PeriodoDetalle> = {}) {
  return {
    id: 7,
    mes: 9,
    anio: 2026,
    quincena: 1,
    fechaInicio: '2026-09-01',
    fechaFin: '2026-09-15',
    estado: 'borrador',
    atrasado: false,
    fechaPago: null,
    observaciones: null,
    sucursalNombre: 'Norte',
    detalles,
    ...over,
  } satisfies PeriodoDetalle
}

/** formatCRC usa espacio duro de miles; Testing Library lo normaliza a espacio común. */
const monto = (n: number) => formatCRC(n).replace(/\s/g, ' ')

const ANA = fila({ id: 1, historialLaboralId: 1, empleadoNombre: 'Ana Mora', totalAPagar: 356680 })
// Fabián salió el 10/9: su quincena va en la liquidación n.° 55.
const FABIAN = fila({
  id: 2,
  historialLaboralId: 2,
  empleadoNombre: 'Fabián Rojas',
  empleadoCedula: '2-2222-2222',
  totalAPagar: 222222,
  diasPorRevisar: [{ fecha: '2026-09-03', problema: 'sin_salida' }],
  liquidacionQueLaPaga: 55,
})

describe('PeriodoDetail: filas que paga una liquidación', () => {
  it('muestra la liquidación que la paga en vez del botón de pago', () => {
    render(<PeriodoDetail periodo={periodo([ANA, FABIAN])} canWrite conceptosManuales={[]} />)

    expect(screen.getAllByText('En liquidación n.° 55').length).toBeGreaterThan(0)
    expect(screen.getByText('1 fila(s) se pagan en una liquidación')).toBeInTheDocument()
    expect(screen.getByText(/Fabián Rojas: su salario de esta quincena va/)).toBeInTheDocument()
  })

  it('no suma la fila a lo que sale del banco por esta planilla', () => {
    render(<PeriodoDetail periodo={periodo([ANA, FABIAN])} canWrite conceptosManuales={[]} />)

    // El total del pie de la tabla: solo Ana.
    expect(screen.getAllByText(monto(356680)).length).toBeGreaterThan(0)
    expect(screen.queryByText(monto(356680 + 222222))).not.toBeInTheDocument()
  })

  it('sus marcas incompletas no traban el pago de los demás', () => {
    render(<PeriodoDetail periodo={periodo([ANA, FABIAN])} canWrite conceptosManuales={[]} />)

    expect(screen.queryByText(/con marcas de asistencia incompletas/)).not.toBeInTheDocument()
  })

  it('no ofrece editar los ingresos de la fila cubierta', () => {
    render(<PeriodoDetail periodo={periodo([FABIAN])} canWrite conceptosManuales={[]} />)

    expect(screen.queryByRole('button', { name: 'Editar ingresos' })).not.toBeInTheDocument()
  })

  it('sin liquidación, todo sigue como antes', () => {
    render(
      <PeriodoDetail
        periodo={periodo([ANA, { ...FABIAN, liquidacionQueLaPaga: null }])}
        canWrite
        conceptosManuales={[]}
      />
    )

    expect(screen.queryByText(/se pagan en una liquidación/)).not.toBeInTheDocument()
    expect(screen.getByText(/con marcas de asistencia incompletas/)).toBeInTheDocument()
    expect(screen.queryByText(/En liquidación n\.°/)).not.toBeInTheDocument()
    expect(screen.getAllByText(monto(356680 + 222222)).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: 'Editar ingresos' }).length).toBeGreaterThan(0)
  })
})
