import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EmployeesList } from './EmployeesList'
import type { EmpleadoListItem } from '@/modules/employees/types'

const push = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

function empleado(overrides: Partial<EmpleadoListItem>): EmpleadoListItem {
  return {
    emp_id: 1,
    emp_nombre: 'Ana',
    emp_apellido_1: 'Mora',
    emp_apellido_2: null,
    emp_numero_identificacion: '1-1111-1111',
    emp_telefono: null,
    emp_email_personal: null,
    emp_fecha_ingreso_original: '2024-01-01',
    emp_genero: null,
    emp_nacionalidad: 'Costarricense',
    puesto_nombre: 'Cajera',
    sucursal_nombre: 'Central',
    tipo_contrato_nombre: 'Indefinido',
    salario_base: 500000,
    fecha_inicio_contrato: '2024-02-01',
    activo: true,
    foto_url: null,
    ...overrides,
  }
}

const EMPLOYEES: EmpleadoListItem[] = [
  empleado({ emp_id: 1, emp_nombre: 'Ana', emp_apellido_1: 'Mora' }),
  empleado({
    emp_id: 2,
    emp_nombre: 'José',
    emp_apellido_1: 'Pérez',
    puesto_nombre: 'Vendedor',
    tipo_contrato_nombre: 'Plazo fijo',
  }),
  empleado({
    emp_id: 3,
    emp_nombre: 'Luis',
    emp_apellido_1: 'Rojas',
    puesto_nombre: null,
    sucursal_nombre: null,
    tipo_contrato_nombre: null,
    fecha_inicio_contrato: null,
    activo: false,
  }),
]

describe('<EmployeesList />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('muestra los empleados con su contrato y estado', () => {
    render(<EmployeesList employees={EMPLOYEES} canWrite />)

    expect(screen.getByText('Ana Mora')).toBeInTheDocument()
    expect(screen.getByText('Cajera')).toBeInTheDocument()
    expect(screen.getAllByText('01/02/2024')).toHaveLength(2)
    expect(screen.getAllByText('Activo')).toHaveLength(2)
    expect(screen.getByText('Inactivo')).toBeInTheDocument()
  })

  it('muestra avatar con foto o iniciales según cada empleado', () => {
    render(
      <EmployeesList
        employees={[
          empleado({ emp_id: 1, emp_nombre: 'Ana', emp_apellido_1: 'Mora', foto_url: null }),
          empleado({
            emp_id: 2,
            emp_nombre: 'José',
            emp_apellido_1: 'Pérez',
            foto_url: 'https://cdn.example/jose.jpg?token=t',
          }),
        ]}
        canWrite
      />
    )

    // Sin foto: iniciales.
    expect(screen.getByText('AM')).toBeInTheDocument()
    // Con foto: <img> con la URL firmada, sin exponer nada del proveedor.
    const img = screen.getByAltText('Foto de José Pérez')
    expect(img).toHaveAttribute('src', 'https://cdn.example/jose.jpg?token=t')
  })

  it('muestra estado vacío con CTA cuando no hay empleados y canWrite', () => {
    render(<EmployeesList employees={[]} canWrite />)

    expect(screen.getByText('Todavía no hay empleados registrados')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /registrar el primer empleado/i })).toBeInTheDocument()
  })

  it('oculta el CTA del estado vacío sin canWrite', () => {
    render(<EmployeesList employees={[]} canWrite={false} />)

    expect(
      screen.queryByRole('link', { name: /registrar el primer empleado/i })
    ).not.toBeInTheDocument()
  })

  it('filtra por búsqueda de texto y muestra vacío de filtros', async () => {
    const user = userEvent.setup()
    render(<EmployeesList employees={EMPLOYEES} canWrite />)

    await user.type(screen.getByPlaceholderText(/buscar por nombre/i), 'perez')

    expect(screen.getByText('José Pérez')).toBeInTheDocument()
    expect(screen.queryByText('Ana Mora')).not.toBeInTheDocument()

    await user.clear(screen.getByPlaceholderText(/buscar por nombre/i))
    await user.type(screen.getByPlaceholderText(/buscar por nombre/i), 'zzz')

    expect(screen.getByText('Sin resultados')).toBeInTheDocument()
  })

  it('filtra por estado con el select', async () => {
    const user = userEvent.setup()
    render(<EmployeesList employees={EMPLOYEES} canWrite />)

    await user.selectOptions(screen.getByLabelText(/filtrar por estado/i), 'inactivos')

    expect(screen.getByText('Luis Rojas')).toBeInTheDocument()
    expect(screen.queryByText('Ana Mora')).not.toBeInTheDocument()
  })

  it('filtra por tipo de contrato derivado de la data', async () => {
    const user = userEvent.setup()
    render(<EmployeesList employees={EMPLOYEES} canWrite />)

    await user.selectOptions(screen.getByLabelText(/filtrar por tipo de contrato/i), 'Plazo fijo')

    expect(screen.getByText('José Pérez')).toBeInTheDocument()
    expect(screen.queryByText('Ana Mora')).not.toBeInTheDocument()
  })

  it('navega al detalle al hacer click en la fila', async () => {
    const user = userEvent.setup()
    render(<EmployeesList employees={EMPLOYEES} canWrite />)

    await user.click(screen.getByText('Cajera'))

    expect(push).toHaveBeenCalledWith('/employees/1')
  })

  it('el nombre es un enlace real al detalle', () => {
    render(<EmployeesList employees={EMPLOYEES} canWrite />)

    expect(screen.getByRole('link', { name: 'Ana Mora' })).toHaveAttribute('href', '/employees/1')
  })
})
