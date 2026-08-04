import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Avatar } from './Avatar'

describe('Avatar', () => {
  it('renderiza la imagen cuando hay fotoUrl', () => {
    render(<Avatar fotoUrl="https://cdn.example/foto.jpg?token=t" nombre="Juan Pérez" />)

    const img = screen.getByAltText('Foto de Juan Pérez')
    expect(img).toHaveAttribute('src', 'https://cdn.example/foto.jpg?token=t')
  })

  it('sin fotoUrl muestra las iniciales de nombre + primer apellido', () => {
    render(<Avatar fotoUrl={null} nombre="Juan Pérez" />)

    expect(screen.getByText('JP')).toBeInTheDocument()
    // El fallback usa role="img" a propósito (representa una foto ausente
    // ante lectores de pantalla): lo que importa es que NO haya un <img> real.
    expect(document.querySelector('img')).not.toBeInTheDocument()
  })

  it('con un solo nombre usa solo su inicial', () => {
    render(<Avatar fotoUrl={undefined} nombre="Madonna" />)

    expect(screen.getByText('M')).toBeInTheDocument()
  })

  it('nombre vacío cae al fallback "?"', () => {
    render(<Avatar fotoUrl={null} nombre="   " />)

    expect(screen.getByText('?')).toBeInTheDocument()
  })

  it('si la imagen falla (URL firmada vencida) cae a las iniciales', () => {
    render(<Avatar fotoUrl="https://cdn.example/vencida.jpg" nombre="Ana Solís" />)

    const img = screen.getByAltText('Foto de Ana Solís')
    fireEvent.error(img)

    expect(screen.getByText('AS')).toBeInTheDocument()
    expect(document.querySelector('img')).not.toBeInTheDocument()
  })

  it('aplica la clase de tamaño según la prop size', () => {
    const { rerender } = render(<Avatar fotoUrl={null} nombre="X Y" size="sm" />)
    expect(screen.getByText('XY')).toHaveClass('h-8', 'w-8')

    rerender(<Avatar fotoUrl={null} nombre="X Y" size="xl" />)
    expect(screen.getByText('XY')).toHaveClass('h-24', 'w-24')
  })
})
