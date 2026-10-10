import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CompanyIdentity } from './CompanyIdentity'

const EMPRESA = 'TecnoCel'

describe('CompanyIdentity', () => {
  it('muestra el nombre de la empresa y su inicial cuando no hay logo', () => {
    render(<CompanyIdentity logoUrl={null} empresaNombre={EMPRESA} sucursalNombre={null} />)

    expect(screen.getByText(EMPRESA)).toBeInTheDocument()
    expect(screen.getByText(EMPRESA.charAt(0))).toBeInTheDocument()
  })

  it('con logo muestra la imagen en vez de la inicial', () => {
    render(
      <CompanyIdentity
        logoUrl="https://cdn.example/logo.png"
        empresaNombre={EMPRESA}
        sucursalNombre={null}
      />
    )

    expect(screen.getByAltText(`Logo de ${EMPRESA}`)).toBeInTheDocument()
  })

  it('con sucursal asignada la muestra debajo del nombre de la empresa', () => {
    render(<CompanyIdentity logoUrl={null} empresaNombre={EMPRESA} sucursalNombre="PZ2" />)

    expect(screen.getByText('PZ2')).toBeInTheDocument()
  })

  it('sin sucursal asignada (p. ej. ADMIN) cae al nombre del sistema', () => {
    render(<CompanyIdentity logoUrl={null} empresaNombre={EMPRESA} sucursalNombre={null} />)

    expect(screen.getByText('SGRH')).toBeInTheDocument()
  })

  it('compact oculta la línea de la sucursal', () => {
    render(<CompanyIdentity logoUrl={null} empresaNombre={EMPRESA} sucursalNombre="PZ2" compact />)

    expect(screen.getByText(EMPRESA)).toBeInTheDocument()
    expect(screen.queryByText('PZ2')).not.toBeInTheDocument()
  })

  it('el nombre lleva title para poder leerlo completo si se trunca', () => {
    render(<CompanyIdentity logoUrl={null} empresaNombre={EMPRESA} sucursalNombre={null} />)

    expect(screen.getByText(EMPRESA)).toHaveAttribute('title', EMPRESA)
  })
})
