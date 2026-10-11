import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { ConceptosList } from './ConceptosList'
import type { ConceptoNominaRow } from '@/modules/payroll/types'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/modules/payroll/actions/deleteConcepto', () => ({ deleteConcepto: vi.fn() }))
vi.mock('@/modules/payroll/actions/createConcepto', () => ({ createConcepto: vi.fn() }))
vi.mock('@/modules/payroll/actions/updateConcepto', () => ({ updateConcepto: vi.fn() }))

const BASE = {
  con_id: 1,
  con_codigo: 'BASE',
  con_nombre: 'Salario base',
  con_tipo: 'ingreso',
  con_tipo_calculo: 'monto_manual_ingreso',
  con_activo: true,
  con_afecta_salario_bruto: true,
  con_afecta_base_ccss: true,
  con_porcentaje: null,
} as unknown as ConceptoNominaRow

describe('<ConceptosList />', () => {
  it('los botones de solo icono dicen qué hacen al pasar el mouse', () => {
    render(<ConceptosList conceptos={[BASE]} canWrite />)

    // Tarjetas (móvil) y tabla: jsdom ve las dos.
    const editar = screen.getAllByRole('button', { name: 'Editar' })
    const eliminar = screen.getAllByRole('button', { name: 'Eliminar' })
    expect(editar).toHaveLength(2)
    expect(eliminar).toHaveLength(2)
    for (const boton of editar) expect(boton).toHaveAttribute('title', 'Editar')
    for (const boton of eliminar) expect(boton).toHaveAttribute('title', 'Eliminar')
  })

  it('el aviso de la plantilla se destaca y marca Excel en verde', () => {
    render(<ConceptosList conceptos={[BASE]} canWrite />)
    const aviso = screen.getByRole('note')

    expect(aviso).toHaveClass('border-amber-300', 'bg-amber-50')
    const [palabra, etiqueta] = within(aviso).getAllByText('Excel')
    expect(palabra).toHaveClass('text-emerald-700')
    expect(etiqueta).toHaveClass('bg-emerald-100', 'text-emerald-800')
  })
})
