import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { terminationConfirmMessage, TerminateContractForm } from './TerminateContractForm'
import { chooseSelectMenuOption } from '@/test/selectMenu'
import type { MotivoSalidaItem } from '@/modules/employees/types'
import { todayInCostaRica } from '@/modules/attendance/lib/time'

const MOTIVOS: MotivoSalidaItem[] = [
  {
    id: 1,
    nombre: 'Renuncia Voluntaria',
    generaCesantia: false,
    generaPreaviso: false,
    notaLegal: null,
  },
  {
    id: 2,
    nombre: 'Despido con Responsabilidad Patronal',
    generaCesantia: true,
    generaPreaviso: true,
    notaLegal: null,
  },
]

/** Elige el día 15 del mes que abre el calendario (el corriente). */
async function elegirUltimoDia(user: UserEvent) {
  await user.click(screen.getByRole('button', { name: 'Último día de trabajo' }))
  const calendario = within(screen.getByRole('dialog', { name: 'Último día de trabajo' }))
  const celda = calendario.getAllByRole('button').find((b) => b.textContent?.trim() === '15')!
  await user.click(celda)
  const hoy = new Date()
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-15`
}

describe('terminationConfirmMessage', () => {
  it('con un último día ya pasado, el contrato se cierra en el acto', () => {
    expect(terminationConfirmMessage('2026-09-01', '2026-09-27')).toContain(
      'quedará terminado y pendiente de liquidar'
    )
  })

  // Preaviso: la persona sigue marcando y cobrando hasta su último día.
  it.each(['2026-09-27', '2026-10-15'])(
    'con %s (hoy o futuro) sigue activo hasta ese día',
    (fecha) => {
      const [anio, mes, dia] = fecha.split('-')
      const mensaje = terminationConfirmMessage(fecha, '2026-09-27')

      expect(mensaje).toContain(`Seguirá activo hasta el ${dia}/${mes}/${anio}`)
      expect(mensaje).toContain('se cierra solo')
    }
  )
})

describe('<TerminateContractForm />', () => {
  it('no confirma una terminación sin fecha ni motivo', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<TerminateContractForm motivos={MOTIVOS} onCancel={vi.fn()} onSubmit={onSubmit} />)

    await user.click(screen.getByRole('button', { name: 'Terminar contrato' }))

    expect(await screen.findByText('El motivo de salida es obligatorio')).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('al elegir el motivo dice si genera cesantía y preaviso', async () => {
    const user = userEvent.setup()
    render(<TerminateContractForm motivos={MOTIVOS} onCancel={vi.fn()} onSubmit={vi.fn()} />)

    await chooseSelectMenuOption(user, 'Motivo de salida *', 'Despido con Responsabilidad Patronal')

    expect(screen.getByText(/genera cesantía\. genera preaviso\./i)).toBeInTheDocument()
  })

  it('pide confirmación y recién ahí envía', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<TerminateContractForm motivos={MOTIVOS} onCancel={vi.fn()} onSubmit={onSubmit} />)

    const fecha = await elegirUltimoDia(user)
    await chooseSelectMenuOption(user, 'Motivo de salida *', 'Renuncia Voluntaria')
    await user.click(screen.getByRole('button', { name: 'Terminar contrato' }))

    const confirmacion = await screen.findByRole('alertdialog')
    expect(onSubmit).not.toHaveBeenCalled()

    await user.click(within(confirmacion).getByRole('button', { name: 'Terminar contrato' }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        lab_fecha_fin: fecha,
        lab_motivo_salida_id: 1,
        lab_recontratable: true,
        lab_observaciones_salida: null,
      })
    )
  })

  it('cancelar la confirmación no envía nada', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<TerminateContractForm motivos={MOTIVOS} onCancel={vi.fn()} onSubmit={onSubmit} />)

    await elegirUltimoDia(user)
    await chooseSelectMenuOption(user, 'Motivo de salida *', 'Renuncia Voluntaria')
    await user.click(screen.getByRole('button', { name: 'Terminar contrato' }))
    const confirmacion = await screen.findByRole('alertdialog')

    await user.click(within(confirmacion).getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('manda si es recontratable y las observaciones', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<TerminateContractForm motivos={MOTIVOS} onCancel={vi.fn()} onSubmit={onSubmit} />)

    await elegirUltimoDia(user)
    await chooseSelectMenuOption(user, 'Motivo de salida *', 'Renuncia Voluntaria')
    await user.click(screen.getByLabelText('Recontratable'))
    await user.type(screen.getByLabelText('Observaciones (opcional)'), 'Abandono de trabajo')
    await user.click(screen.getByRole('button', { name: 'Terminar contrato' }))
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Terminar contrato',
      })
    )

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          lab_recontratable: false,
          lab_observaciones_salida: 'Abandono de trabajo',
        })
      )
    )
  })

  // Hoy por defecto: la persona trabaja hasta el final del día y el job
  // cierra el contrato mañana.
  it('el último día arranca en hoy y se envía así si no se cambia', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<TerminateContractForm motivos={MOTIVOS} onCancel={vi.fn()} onSubmit={onSubmit} />)

    await chooseSelectMenuOption(user, 'Motivo de salida *', 'Renuncia Voluntaria')
    await user.click(screen.getByRole('button', { name: 'Terminar contrato' }))
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Terminar contrato',
      })
    )

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ lab_fecha_fin: todayInCostaRica() })
      )
    )
  })
})
