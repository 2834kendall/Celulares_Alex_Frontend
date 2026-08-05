import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EmployeeForm } from './EmployeeForm'
import { updateEmployee } from '@/modules/employees/actions/updateEmployee'
import { BANCOS, EMPLEADO_DETALLE, TERRITORIO, TIPOS_IDENTIFICACION } from './testFixtures'

vi.mock('@/modules/employees/actions/updateEmployee', () => ({
  updateEmployee: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}))

const mockUpdateEmployee = vi.mocked(updateEmployee)

describe('<EmployeeForm />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('precarga los datos del empleado', () => {
    render(
      <EmployeeForm
        empleado={EMPLEADO_DETALLE}
        tiposIdentificacion={TIPOS_IDENTIFICACION}
        bancos={BANCOS}
        territorio={TERRITORIO}
      />
    )

    expect(screen.getByLabelText('Nombre *')).toHaveValue('Ana')
    expect(screen.getByLabelText('Primer apellido *')).toHaveValue('Mora')
    expect(screen.getByLabelText('Teléfono')).toHaveValue('8888-8888')
    expect(screen.getByLabelText('Banco')).toHaveValue('3')
    expect(screen.getByLabelText('Tipo de cuenta')).toHaveValue('AHORRO')
  })

  it('bloquea el submit con datos inválidos sin llamar la action', async () => {
    const user = userEvent.setup()
    render(
      <EmployeeForm
        empleado={EMPLEADO_DETALLE}
        tiposIdentificacion={TIPOS_IDENTIFICACION}
        bancos={BANCOS}
        territorio={TERRITORIO}
      />
    )

    await user.clear(screen.getByLabelText('Nombre *'))
    await user.click(screen.getByRole('button', { name: /guardar cambios/i }))

    expect(await screen.findByText('El nombre debe tener al menos 2 caracteres')).toBeVisible()
    expect(mockUpdateEmployee).not.toHaveBeenCalled()
  })

  it('envía los cambios y llama onSuccess', async () => {
    mockUpdateEmployee.mockResolvedValue({ ok: true })
    const onSuccess = vi.fn()
    const user = userEvent.setup()

    render(
      <EmployeeForm
        empleado={EMPLEADO_DETALLE}
        tiposIdentificacion={TIPOS_IDENTIFICACION}
        bancos={BANCOS}
        territorio={TERRITORIO}
        onSuccess={onSuccess}
      />
    )

    await user.clear(screen.getByLabelText('Teléfono'))
    await user.type(screen.getByLabelText('Teléfono'), '7777-7777')
    await user.click(screen.getByRole('button', { name: /guardar cambios/i }))

    await waitFor(() => {
      expect(mockUpdateEmployee).toHaveBeenCalledWith(
        10,
        expect.objectContaining({
          empleado: expect.objectContaining({ emp_telefono: '7777-7777', emp_nombre: 'Ana' }),
          datos_pago: expect.objectContaining({ edp_banco_id: 3, edp_tipo_cuenta: 'AHORRO' }),
        })
      )
    })
    expect(onSuccess).toHaveBeenCalled()
  })

  it('convierte los campos vacíos en null al enviar', async () => {
    mockUpdateEmployee.mockResolvedValue({ ok: true })
    const user = userEvent.setup()

    render(
      <EmployeeForm
        empleado={EMPLEADO_DETALLE}
        tiposIdentificacion={TIPOS_IDENTIFICACION}
        bancos={BANCOS}
        territorio={TERRITORIO}
      />
    )

    await user.clear(screen.getByLabelText('Teléfono'))
    await user.click(screen.getByRole('button', { name: /guardar cambios/i }))

    await waitFor(() => {
      expect(mockUpdateEmployee).toHaveBeenCalledWith(
        10,
        expect.objectContaining({
          empleado: expect.objectContaining({ emp_telefono: null }),
        })
      )
    })
  })

  it('muestra el error del servidor en un banner', async () => {
    mockUpdateEmployee.mockResolvedValue({ ok: false, error: 'No se pudo actualizar.' })
    const onSuccess = vi.fn()
    const user = userEvent.setup()

    render(
      <EmployeeForm
        empleado={EMPLEADO_DETALLE}
        tiposIdentificacion={TIPOS_IDENTIFICACION}
        bancos={BANCOS}
        territorio={TERRITORIO}
        onSuccess={onSuccess}
      />
    )

    await user.click(screen.getByRole('button', { name: /guardar cambios/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo actualizar.')
    expect(onSuccess).not.toHaveBeenCalled()
  })

  // ── Dirección: cascada y arrastre de valores ───────────────────────────────

  function renderForm() {
    return render(
      <EmployeeForm
        empleado={EMPLEADO_DETALLE}
        tiposIdentificacion={TIPOS_IDENTIFICACION}
        bancos={BANCOS}
        territorio={TERRITORIO}
      />
    )
  }

  it('arranca la cascada posicionada en la dirección guardada', () => {
    renderForm()

    // Solo se persiste el distrito (121 = Escazú); provincia y cantón se
    // remontan por la cadena de FKs al montar.
    expect(screen.getByLabelText('Provincia *')).toHaveValue('1')
    expect(screen.getByLabelText('Cantón *')).toHaveValue('12')
    expect(screen.getByLabelText('Distrito *')).toHaveValue('121')
    expect(screen.getByLabelText('Código postal')).toHaveValue('10201')
    expect(screen.getByLabelText('Señas exactas *')).toHaveValue('200 m norte de la iglesia')
  })

  it('filtra los cantones y distritos según el nivel superior', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.selectOptions(screen.getByLabelText('Provincia *'), '2')

    // Alajuela solo tiene su propio cantón en el fixture.
    const cantones = within(screen.getByLabelText('Cantón *') as HTMLSelectElement)
    expect(cantones.getByRole('option', { name: 'Alajuela' })).toBeInTheDocument()
    expect(cantones.queryByRole('option', { name: 'Escazú' })).not.toBeInTheDocument()
  })

  it('cambiar de provincia limpia cantón y distrito', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.selectOptions(screen.getByLabelText('Provincia *'), '2')

    expect(screen.getByLabelText('Cantón *')).toHaveValue('')
    expect(screen.getByLabelText('Distrito *')).toHaveValue('')
    // El postal se deriva del distrito: sin distrito, no hay postal.
    expect(screen.getByLabelText('Código postal')).toHaveValue('')
  })

  it('deshabilita cada nivel hasta que se elige el anterior', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.selectOptions(screen.getByLabelText('Provincia *'), '2')

    expect(screen.getByLabelText('Cantón *')).toBeEnabled()
    expect(screen.getByLabelText('Distrito *')).toBeDisabled()

    await user.selectOptions(screen.getByLabelText('Cantón *'), '21')

    expect(screen.getByLabelText('Distrito *')).toBeEnabled()
  })

  // Regresión: resolver la limpieza con un useEffect sobre el valor borraría lo
  // guardado apenas se monta el formulario de edición.
  it('montar el formulario NO borra el distrito ni la cuenta ya guardados', () => {
    renderForm()

    expect(screen.getByLabelText('Distrito *')).toHaveValue('121')
    expect(screen.getByLabelText('Banco')).toHaveValue('3')
    expect(screen.getByLabelText('Tipo de cuenta')).toHaveValue('AHORRO')
  })

  it('cambiar de banco limpia el número de cuenta', async () => {
    const user = userEvent.setup()
    render(
      <EmployeeForm
        empleado={{
          ...EMPLEADO_DETALLE,
          datos_pago: {
            edp_banco_id: 3,
            banco_nombre: 'BAC Credomatic',
            edp_tipo_cuenta: 'AHORRO',
            edp_numero_cuenta: 'CR02010200000000000001',
          },
        }}
        tiposIdentificacion={TIPOS_IDENTIFICACION}
        bancos={BANCOS}
        territorio={TERRITORIO}
      />
    )

    const cuenta = screen.getByLabelText('Número de cuenta (IBAN / SINPE)')
    expect(cuenta).toHaveValue('CR02 0102 0000 0000 0000 01')

    // El IBAN lleva el código de entidad del BAC: con otro banco deja de ser válido.
    await user.selectOptions(screen.getByLabelText('Banco'), '5')

    expect(cuenta).toHaveValue('')
  })

  it('cambiar el tipo de cuenta limpia el número (SINPE usa otro formato)', async () => {
    const user = userEvent.setup()
    render(
      <EmployeeForm
        empleado={{
          ...EMPLEADO_DETALLE,
          datos_pago: {
            edp_banco_id: 3,
            banco_nombre: 'BAC Credomatic',
            edp_tipo_cuenta: 'AHORRO',
            edp_numero_cuenta: 'CR02010200000000000001',
          },
        }}
        tiposIdentificacion={TIPOS_IDENTIFICACION}
        bancos={BANCOS}
        territorio={TERRITORIO}
      />
    )

    await user.selectOptions(screen.getByLabelText('Tipo de cuenta'), 'SINPE')

    expect(screen.getByLabelText('Número de cuenta (IBAN / SINPE)')).toHaveValue('')
  })
})
