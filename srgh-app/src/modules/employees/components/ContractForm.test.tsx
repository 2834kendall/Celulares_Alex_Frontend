import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ContractForm } from './ContractForm'
import type { CrearHistorialLaboralInput } from '@/modules/employees/types'
import { todayInCostaRica } from '@/modules/attendance/lib/time'

/** Hoy en hora de Costa Rica, como lo pinta el trigger de DateField. */
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

  it('al editar muestra la sucursal como texto y no la deja cambiar', () => {
    render(
      <ContractForm
        modo="editar"
        catalogos={CATALOGOS}
        sucursalNombre="Central"
        defaultValues={COMPLETO}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />
    )

    expect(screen.queryByLabelText('Sucursal *')).not.toBeInTheDocument()
    expect(screen.getByText('Central')).toBeInTheDocument()
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

  it('al editar no envía la sucursal aunque venga en los valores iniciales', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <ContractForm
        modo="editar"
        catalogos={CATALOGOS}
        sucursalNombre="Central"
        defaultValues={COMPLETO}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('lab_sucursal_id')
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

    expect(screen.getByRole('button', { name: 'Inicio del contrato' })).toHaveTextContent(
      hoyComoSeVe()
    )
  })
})
