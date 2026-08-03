import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { EmployeeWizard } from './EmployeeWizard'
import { TERRITORIO } from './testFixtures'
import { createEmployee } from '@/modules/employees/actions/createEmployee'

const push = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

vi.mock('@/modules/employees/actions/createEmployee', () => ({
  createEmployee: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}))

const mockCreateEmployee = vi.mocked(createEmployee)

const CATALOGOS = {
  tiposIdentificacion: [{ id: 1, nombre: 'Cédula nacional' }],
  puestos: [{ id: 3, nombre: 'Cajera' }],
  sucursales: [{ id: 2, nombre: 'Central' }],
  tiposContrato: [{ id: 1, nombre: 'Indefinido' }],
  tiposJornada: [{ id: 1, nombre: 'Diurna' }],
  bancos: [{ id: 3, nombre: 'BAC Credomatic' }],
  territorio: TERRITORIO,
  roles: [{ id: 4, nombre: 'Empleado' }],
}

// Mismo formato que usa CurrencyInput; el separador de miles depende del ICU
// del entorno, así que el valor esperado se calcula, no se hardcodea.
const MILES_FORMAT = new Intl.NumberFormat('es-CR', { maximumFractionDigits: 0 })

function renderWizard(canInviteUser = true) {
  return render(<EmployeeWizard {...CATALOGOS} canInviteUser={canInviteUser} />)
}

async function fillStepPersonal(user: UserEvent) {
  await user.type(screen.getByLabelText('Nombre *'), 'Ana')
  await user.type(screen.getByLabelText('Primer apellido *'), 'Mora')
  await user.selectOptions(screen.getByLabelText('Tipo de identificación *'), '1')
  await user.type(screen.getByLabelText('Número de identificación *'), '1-1111-1111')
  fireEvent.change(screen.getByLabelText('Fecha de ingreso *'), {
    target: { value: '2024-01-01' },
  })
  await fillDireccion(user)
}

/** La dirección vive en el paso 1: sin ella «Siguiente» no avanza. */
async function fillDireccion(user: UserEvent) {
  await user.selectOptions(screen.getByLabelText('Provincia *'), '1')
  await user.selectOptions(screen.getByLabelText('Cantón *'), '12')
  await user.selectOptions(screen.getByLabelText('Distrito *'), '121')
  await user.type(screen.getByLabelText('Señas exactas *'), '200 m norte de la iglesia')
}

async function fillStepNomina(user: UserEvent) {
  await user.selectOptions(screen.getByLabelText('Puesto *'), '3')
  await user.selectOptions(screen.getByLabelText('Sucursal *'), '2')
  await user.selectOptions(screen.getByLabelText('Tipo de contrato *'), '1')
  await user.selectOptions(screen.getByLabelText('Tipo de jornada *'), '1')
  fireEvent.change(screen.getByLabelText('Fecha de inicio *'), {
    target: { value: '2024-02-01' },
  })
  await user.type(screen.getByLabelText('Salario base (₡) *'), '500000')
  await user.type(screen.getByLabelText('Salario real (₡) *'), '550000')
}

describe('<EmployeeWizard />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('arranca en el paso 1 con el stepper visible', () => {
    renderWizard()

    expect(screen.getByText('Información principal')).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre *')).toBeInTheDocument()
    expect(screen.queryByLabelText('Puesto *')).not.toBeInTheDocument()
  })

  it('bloquea "Siguiente" si el paso 1 tiene errores', async () => {
    const user = userEvent.setup()
    renderWizard()

    await user.click(screen.getByRole('button', { name: /siguiente/i }))

    expect(await screen.findByText('El nombre debe tener al menos 2 caracteres')).toBeVisible()
    expect(screen.getByLabelText('Nombre *')).toBeInTheDocument()
    expect(mockCreateEmployee).not.toHaveBeenCalled()
  })

  it('avanza al paso 2 con el paso 1 válido y conserva valores al volver', async () => {
    const user = userEvent.setup()
    renderWizard()

    await fillStepPersonal(user)
    await user.click(screen.getByRole('button', { name: /siguiente/i }))

    expect(await screen.findByLabelText('Puesto *')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /anterior/i }))

    expect(screen.getByLabelText('Nombre *')).toHaveValue('Ana')
  })

  it('crea el empleado sin usuario y navega al detalle', async () => {
    mockCreateEmployee.mockResolvedValue({ ok: true, empId: 10 })
    const user = userEvent.setup()
    renderWizard()

    await fillStepPersonal(user)
    await user.click(screen.getByRole('button', { name: /siguiente/i }))
    await screen.findByLabelText('Puesto *')

    await fillStepNomina(user)
    // El input de salario muestra separadores de miles pero envía un number.
    expect(screen.getByLabelText('Salario base (₡) *')).toHaveValue(MILES_FORMAT.format(500000))
    await user.click(screen.getByRole('button', { name: /siguiente/i }))
    await screen.findByText('Crear cuenta de usuario del sistema')

    // Regresión: llegar al paso 3 NO debe crear el empleado todavía,
    // y el resumen debe mostrar lo capturado en los pasos anteriores.
    expect(mockCreateEmployee).not.toHaveBeenCalled()
    expect(screen.getByText('Ana Mora')).toBeInTheDocument()
    expect(screen.getByText('Cajera')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /crear empleado/i }))

    await waitFor(() => {
      expect(mockCreateEmployee).toHaveBeenCalledWith(
        expect.objectContaining({
          empleado: expect.objectContaining({
            emp_nombre: 'Ana',
            emp_apellido_1: 'Mora',
            emp_tipo_identificacion_id: 1,
            emp_numero_identificacion: '1-1111-1111',
            emp_fecha_ingreso_original: '2024-01-01',
          }),
          contratacion: expect.objectContaining({
            lab_puesto_id: 3,
            lab_sucursal_id: 2,
            lab_salario_base: 500000,
            lab_salario_real: 550000,
          }),
          usuario: undefined,
        })
      )
    })
    expect(push).toHaveBeenCalledWith('/employees/10')
  })

  it('exige elegir banco, antepone el CR solo y valida el checksum del IBAN', async () => {
    const user = userEvent.setup()
    renderWizard()

    await fillStepPersonal(user)
    await user.click(screen.getByRole('button', { name: /siguiente/i }))
    await screen.findByLabelText('Puesto *')
    await fillStepNomina(user)

    // Sin banco elegido no se puede digitar la cuenta.
    const iban = screen.getByLabelText('Número de cuenta (IBAN / SINPE)')
    expect(iban).toBeDisabled()

    await user.selectOptions(screen.getByLabelText('Banco'), '3')
    expect(iban).toBeEnabled()

    // Solo se digitan los dígitos: el prefijo CR se antepone solo. Este
    // checksum es incorrecto (CR06… en vez de CR05…) y bloquea el "Siguiente".
    await user.type(iban, '06015202001026284066')
    expect(iban).toHaveValue('CR06 0152 0200 1026 2840 66')
    await user.click(screen.getByRole('button', { name: /siguiente/i }))
    expect(
      await screen.findByText('El IBAN no es válido (dígitos verificadores incorrectos)')
    ).toBeVisible()
    expect(screen.getByLabelText('Puesto *')).toBeInTheDocument()

    // Con el IBAN correcto sí avanza al paso 3.
    await user.clear(iban)
    await user.type(iban, '05015202001026284066')
    await user.click(screen.getByRole('button', { name: /siguiente/i }))
    expect(await screen.findByText('Crear cuenta de usuario del sistema')).toBeInTheDocument()
  })

  it('incluye el usuario cuando se activa el toggle del paso 3', async () => {
    mockCreateEmployee.mockResolvedValue({ ok: true, empId: 10 })
    const user = userEvent.setup()
    renderWizard()

    await fillStepPersonal(user)
    await user.click(screen.getByRole('button', { name: /siguiente/i }))
    await screen.findByLabelText('Puesto *')
    await fillStepNomina(user)
    await user.click(screen.getByRole('button', { name: /siguiente/i }))
    await screen.findByText('Crear cuenta de usuario del sistema')

    await user.click(screen.getByRole('checkbox'))
    await user.type(screen.getByLabelText('Email de acceso *'), 'ana@empresa.com')
    await user.selectOptions(screen.getByLabelText('Rol *'), '4')

    await user.click(screen.getByRole('button', { name: /crear empleado/i }))

    await waitFor(() => {
      expect(mockCreateEmployee).toHaveBeenCalledWith(
        expect.objectContaining({
          usuario: expect.objectContaining({ email: 'ana@empresa.com', rol_id: 4 }),
        })
      )
    })
  })

  it('muestra el error del servidor sin navegar', async () => {
    mockCreateEmployee.mockResolvedValue({
      ok: false,
      error: 'Ya existe un empleado con ese número de identificación.',
    })
    const user = userEvent.setup()
    renderWizard()

    await fillStepPersonal(user)
    await user.click(screen.getByRole('button', { name: /siguiente/i }))
    await screen.findByLabelText('Puesto *')
    await fillStepNomina(user)
    await user.click(screen.getByRole('button', { name: /siguiente/i }))
    await screen.findByText('Crear cuenta de usuario del sistema')

    await user.click(screen.getByRole('button', { name: /crear empleado/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ya existe un empleado con ese número de identificación.'
    )
    expect(push).not.toHaveBeenCalled()
  })

  it('deshabilita el toggle de usuario sin USUARIOS_WRITE', async () => {
    const user = userEvent.setup()
    renderWizard(false)

    await fillStepPersonal(user)
    await user.click(screen.getByRole('button', { name: /siguiente/i }))
    await screen.findByLabelText('Puesto *')
    await fillStepNomina(user)
    await user.click(screen.getByRole('button', { name: /siguiente/i }))
    await screen.findByText('Crear cuenta de usuario del sistema')

    expect(screen.getByRole('checkbox')).toBeDisabled()
    expect(screen.getByText(/tu rol no tiene permiso de gestión de usuarios/i)).toBeVisible()
  })
})
