import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TiposAusenciaList } from './TiposAusenciaList'
import type { AusenciaTypeRow } from '@/modules/absences/types'

vi.mock('@/modules/absences/actions/deleteTipoAusencia', () => ({ deleteTipoAusencia: vi.fn() }))
vi.mock('@/modules/absences/actions/createTipoAusencia', () => ({ createTipoAusencia: vi.fn() }))
vi.mock('@/modules/absences/actions/updateTipoAusencia', () => ({ updateTipoAusencia: vi.fn() }))

function tipo(id: number, nombre: string, codigo = `T${id}`): AusenciaTypeRow {
  return {
    tau_id: id,
    tau_codigo: codigo,
    tau_nombre: nombre,
    tau_requiere_documento_ccss: false,
    tau_paga_empleador_dias: 0,
    tau_porcentaje_pago_empleador: 0,
    tau_paga_ccss_desde_dia: null,
    tau_porcentaje_subsidio_ccss: null,
    tau_descuenta_vacaciones: false,
    tau_es_protegida: false,
    tau_referencia_legal: null,
    tau_es_intradia: false,
  }
}

const muchos = Array.from({ length: 25 }, (_, i) => tipo(i + 1, `Permiso ${i + 1}`))

// Mobil y tabla renderizan ambos en jsdom: se cuenta por el nombre del boton de editar de cada fila.
const filas = () => screen.getAllByRole('button', { name: 'Editar' }).length / 2

describe('<TiposAusenciaList /> busqueda y paginado', () => {
  it('muestra 10 por pagina y navega entre paginas', async () => {
    const user = userEvent.setup()
    render(<TiposAusenciaList tipos={muchos} canWrite />)

    expect(filas()).toBe(10)
    expect(screen.getByText('Página 1 de 3')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Página siguiente' }))
    await user.click(screen.getByRole('button', { name: 'Página siguiente' }))

    expect(screen.getByText('Página 3 de 3')).toBeTruthy()
    expect(filas()).toBe(5)
  })

  it('filtra sin tildes ni mayusculas y vuelve a la pagina 1', async () => {
    const user = userEvent.setup()
    render(<TiposAusenciaList tipos={[...muchos, tipo(99, 'Cita Médica', 'CITA_MED')]} canWrite />)
    await user.click(screen.getByRole('button', { name: 'Página siguiente' }))

    await user.type(screen.getByLabelText('Buscar tipo de ausencia'), 'MEDICA')

    expect(filas()).toBe(1)
    expect(screen.queryByText(/Página/)).toBeNull()
  })

  it('busca por codigo y muestra un vacio cuando nada coincide', async () => {
    const user = userEvent.setup()
    render(<TiposAusenciaList tipos={muchos} canWrite />)
    const search = screen.getByLabelText('Buscar tipo de ausencia')

    await user.type(search, 't7')
    expect(filas()).toBe(1)

    await user.clear(search)
    await user.type(search, 'zzz')
    expect(screen.getByText('Sin resultados')).toBeTruthy()
  })
})
