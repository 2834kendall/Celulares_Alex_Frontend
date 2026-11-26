import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ContractForm } from './ContractForm'
import type { CrearHistorialLaboralInput } from '@/modules/employees/types'
import { formatCurrencyInput } from '@/modules/employees/lib/format'
import { todayInCostaRica } from '@/modules/attendance/lib/time'

/** Hoy en hora de Costa Rica, como lo muestra el campo de fecha. */
function hoyComoSeVe() {
  const [anio, mes, dia] = todayInCostaRica().split('-')
  return `${dia}/${mes}/${anio}`
}

const CATALOGOS = {
  puestos: [
    { id: 3, nombre: 'Cajera' },
    { id: 4, nombre: 'Supervisora' },
  ],
  sucursales: [{ id: 2, nombre: 'Central' }],
  tiposContrato: [{ id: 1, nombre: 'Indefinido' }],
  tiposJornada: [{ id: 1, nombre: 'Diurna' }],
}

const COMPLETO: CrearHistorialLaboralInput = {
  lab_puesto_id: 3,
  lab_sucursal_id: 2,
  lab_tipo_contrato_id: 1,
  lab_tipo_jornada_id: 1,
  lab_fecha_inicio: '2026-10-01',
  lab_salario_base: 450000,
  lab_salario_real: 480000,
}

describe('<ContractForm />', () => {
  it('al crear pide la sucursal', () => {
    render(
      <ContractForm modo="crear" catalogos={CATALOGOS} onCancel={vi.fn()} onSubmit={vi.fn()} />
    )

    expect(screen.getByLabelText('Sucursal *')).toBeInTheDocument()
  })

  // La sucursal del contrato es la BASE (en qué planilla se paga), no dónde
  // trabaja la persona cada día: eso lo rota el horario semanal. Corregirla no
  // mueve la historia, así que se edita.
  it('al editar deja cambiar la sucursal', () => {
    render(
      <ContractForm
        modo="editar"
        catalogos={CATALOGOS}
        sucursalNombre="Central"
        fechaInicio="2026-10-01"
        sucursalBloqueada={null}
        defaultValues={COMPLETO}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />
    )

    expect(screen.getByLabelText('Sucursal *')).toBeInTheDocument()
  })

  // Con una quincena a medio pagar, moverla dejaría la fila en la planilla de
  // la sucursal vieja y la nueva la volvería a crear.
  it('con una quincena sin pagar la muestra como texto, con el motivo', () => {
    render(
      <ContractForm
        modo="editar"
        catalogos={CATALOGOS}
        sucursalNombre="Central"
        fechaInicio="2026-10-01"
        sucursalBloqueada="No se puede cambiar con una quincena sin pagar."
        defaultValues={COMPLETO}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />
    )

    expect(screen.queryByLabelText('Sucursal *')).not.toBeInTheDocument()
    expect(screen.getByText('Central')).toBeInTheDocument()
    expect(screen.getByText('No se puede cambiar con una quincena sin pagar.')).toBeInTheDocument()
  })

  // El campo no se renderiza, pero el valor original sigue viajando: así la RPC
  // ve la misma sucursal, no detecta un cambio y no dispara su guard.
  it('bloqueada, igual envía la sucursal que ya tenía', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <ContractForm
        modo="editar"
        catalogos={CATALOGOS}
        sucursalNombre="Central"
        fechaInicio="2026-10-01"
        sucursalBloqueada="No se puede cambiar con una quincena sin pagar."
        defaultValues={COMPLETO}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ lab_sucursal_id: 2 })
  })

  // Mover el inicio dejaría las marcas, los turnos y el contrato anterior
  // apuntando a un período que ya no existe, así que se ve pero no se toca.
  it('al editar muestra la fecha de inicio como texto y no la deja cambiar', () => {
    render(
      <ContractForm
        modo="editar"
        catalogos={CATALOGOS}
        sucursalNombre="Central"
        fechaInicio="2026-10-01"
        sucursalBloqueada={null}
        defaultValues={COMPLETO}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />
    )

    expect(screen.queryByRole('combobox', { name: 'Inicio del contrato' })).not.toBeInTheDocument()
    expect(screen.getByText('01/10/2026')).toBeInTheDocument()
  })

  it('no envía un contrato incompleto', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <ContractForm modo="crear" catalogos={CATALOGOS} onCancel={vi.fn()} onSubmit={onSubmit} />
    )

    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('El puesto es obligatorio')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('al crear envía todas las condiciones', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <ContractForm
        modo="crear"
        catalogos={CATALOGOS}
        defaultValues={COMPLETO}
        submitLabel="Registrar contrato"
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Registrar contrato' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(COMPLETO))
  })

  it('al editar envía la sucursal pero nunca el inicio del contrato', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <ContractForm
        modo="editar"
        catalogos={CATALOGOS}
        sucursalNombre="Central"
        fechaInicio="2026-10-01"
        sucursalBloqueada={null}
        defaultValues={COMPLETO}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ lab_sucursal_id: 2 })
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('lab_fecha_inicio')
  })

  it('muestra el error que devolvió el servidor', () => {
    render(
      <ContractForm
        modo="crear"
        catalogos={CATALOGOS}
        serverError="El contrato anterior todavía está pendiente de liquidar."
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />
    )

    expect(
      screen.getByText('El contrato anterior todavía está pendiente de liquidar.')
    ).toBeInTheDocument()
  })

  it('Cancelar avisa al padre', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(
      <ContractForm modo="crear" catalogos={CATALOGOS} onCancel={onCancel} onSubmit={vi.fn()} />
    )

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onCancel).toHaveBeenCalled()
  })

  it('un contrato nuevo arranca hoy por defecto', () => {
    render(
      <ContractForm modo="crear" catalogos={CATALOGOS} onCancel={vi.fn()} onSubmit={vi.fn()} />
    )

    expect(screen.getByRole('combobox', { name: 'Inicio del contrato' })).toHaveValue(hoyComoSeVe())
  })

  it('permite digitar salarios con decimales, los formatea al salir y envía el monto exacto', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <ContractForm
        modo="crear"
        catalogos={CATALOGOS}
        defaultValues={COMPLETO}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />
    )

    const salarioBase = screen.getByLabelText('Salario base (₡) *')
    await user.clear(salarioBase)
    await user.type(salarioBase, '1234.56')
    expect(salarioBase).toHaveValue('1234.56')

    await user.tab()
    expect(salarioBase).toHaveValue(formatCurrencyInput(1234.56))

    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          lab_salario_base: 1234.56,
          lab_salario_real: 480000,
        })
      )
    )
  })

  it('rechaza 0 y montos negativos sin convertir -500 en 500', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <ContractForm
        modo="crear"
        catalogos={CATALOGOS}
        defaultValues={COMPLETO}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />
    )

    const salarioBase = screen.getByLabelText('Salario base (₡) *')
    await user.clear(salarioBase)
    await user.type(salarioBase, '0')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('El salario base debe ser mayor a 0')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()

    await user.clear(salarioBase)
    await user.type(salarioBase, '-500')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('El salario base debe ser mayor a 0')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('rechaza montos con más de 2 decimales', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <ContractForm
        modo="crear"
        catalogos={CATALOGOS}
        defaultValues={COMPLETO}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />
    )

    const salarioBase = screen.getByLabelText('Salario base (₡) *')
    await user.clear(salarioBase)
    await user.type(salarioBase, '350000.555')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('El salario puede tener hasta 2 decimales')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('conserva el texto escrito al salir del campo si el formato es inválido para permitir corregirlo', async () => {
    const user = userEvent.setup()
    render(
      <ContractForm
        modo="crear"
        catalogos={CATALOGOS}
        defaultValues={COMPLETO}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />
    )

    const salarioBase = screen.getByLabelText('Salario base (₡) *')
    await user.clear(salarioBase)
    await user.type(salarioBase, '12.34.56')
    await user.tab()

    expect(salarioBase).toHaveValue('12.34.56')
  })
})
