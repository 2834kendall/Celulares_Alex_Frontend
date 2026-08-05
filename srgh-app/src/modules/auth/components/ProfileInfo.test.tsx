import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProfileInfo } from './ProfileInfo'

describe('<ProfileInfo />', () => {
  it('muestra iniciales, correo, empresa y rol', () => {
    render(<ProfileInfo email="jordy@mail.com" rol="ADMIN" empresaNombre="TecnoCel" />)

    expect(screen.getByText('JO')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'jordy@mail.com' })).toBeInTheDocument()
    expect(screen.getByText('ADMIN')).toBeInTheDocument()
    expect(screen.getAllByText(/tecnocel/i).length).toBeGreaterThan(0)
  })

  it('sin rol asignado muestra el texto por defecto', () => {
    render(<ProfileInfo email="user@mail.com" rol={null} empresaNombre="TecnoCel" />)

    expect(screen.getByText('Sin asignar')).toBeInTheDocument()
  })
})
