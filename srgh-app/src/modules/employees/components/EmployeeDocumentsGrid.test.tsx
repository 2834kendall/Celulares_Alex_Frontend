import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EmployeeDocumentsGrid, type DocumentoCardItem } from './EmployeeDocumentsGrid'

function item(overrides: Partial<DocumentoCardItem>): DocumentoCardItem {
  return {
    key: '1',
    nombre: 'Contrato firmado',
    tipoNombre: 'Contrato',
    mime: 'application/pdf',
    descripcion: null,
    fechaVencimiento: null,
    detalle: 'Subido el 01/01/2026',
    ...overrides,
  }
}

describe('<EmployeeDocumentsGrid />', () => {
  it('muestra el mensaje vacío cuando no hay documentos', () => {
    render(<EmployeeDocumentsGrid items={[]} emptyMessage="Sin documentos." />)

    expect(screen.getByText('Sin documentos.')).toBeInTheDocument()
  })

  // La grilla es plana a propósito (el expediente de un empleado ronda los 10
  // documentos): no hay encabezados de grupo por categoría.
  it('renderiza todos los documentos en una grilla plana, sin encabezados de grupo', () => {
    render(
      <EmployeeDocumentsGrid
        items={[
          item({ key: '1', nombre: 'Cédula', tipoNombre: 'Identificación' }),
          item({ key: '2', nombre: 'Contrato firmado', tipoNombre: 'Contrato' }),
        ]}
        emptyMessage="Sin documentos."
      />
    )

    expect(screen.getByText('Cédula')).toBeInTheDocument()
    expect(screen.getByText('Contrato firmado')).toBeInTheDocument()
    expect(screen.queryAllByRole('heading')).toHaveLength(0)
  })

  it('muestra la categoría de cada documento como metadata', () => {
    render(
      <EmployeeDocumentsGrid
        items={[item({ tipoNombre: 'Hoja de delincuencia' })]}
        emptyMessage="Sin documentos."
      />
    )

    expect(screen.getByText('Hoja de delincuencia')).toBeInTheDocument()
  })

  it('muestra el detalle (fecha de subida) cuando no hay vencimiento', () => {
    render(
      <EmployeeDocumentsGrid
        items={[item({ detalle: 'Subido el 03/08/2026' })]}
        emptyMessage="Sin documentos."
      />
    )

    expect(screen.getByText('Subido el 03/08/2026')).toBeInTheDocument()
  })

  it('muestra el badge Vencido solo cuando la fecha ya pasó', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 2))

    render(
      <EmployeeDocumentsGrid
        items={[
          item({ key: '1', nombre: 'Vencido', fechaVencimiento: '2020-01-01' }),
          item({ key: '2', nombre: 'Vigente', fechaVencimiento: '2030-01-01' }),
        ]}
        emptyMessage="Sin documentos."
      />
    )

    expect(screen.getByText('Vencido', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByText(/vence: 01\/01\/2030/i)).toBeInTheDocument()

    vi.useRealTimers()
  })

  it('readOnly oculta editar y eliminar pero conserva descargar', () => {
    render(
      <EmployeeDocumentsGrid
        items={[item({ key: '1' })]}
        emptyMessage="Sin documentos."
        readOnly
        onDownload={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    expect(screen.getByText(/descargar contrato firmado/i)).toBeInTheDocument()
    expect(screen.queryByText(/editar contrato firmado/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/eliminar contrato firmado/i)).not.toBeInTheDocument()
  })

  it('los callbacks reciben la key del documento correcto', async () => {
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    const onDownload = vi.fn()
    const user = userEvent.setup()
    render(
      <EmployeeDocumentsGrid
        items={[item({ key: 'abc', nombre: 'Doc A' })]}
        emptyMessage="Sin documentos."
        onDownload={onDownload}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    )

    await user.click(screen.getByText(/descargar doc a/i))
    await user.click(screen.getByText(/editar doc a/i))
    await user.click(screen.getByText(/eliminar doc a/i))

    expect(onDownload).toHaveBeenCalledWith('abc')
    expect(onEdit).toHaveBeenCalledWith('abc')
    expect(onDelete).toHaveBeenCalledWith('abc')
  })
})
