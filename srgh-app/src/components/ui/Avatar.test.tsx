import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Avatar, initialsOf } from './Avatar'

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

  /*
   * Regresion de SGRH-82: la copia de esta logica que vivia dentro de
   * WeeklyScheduleMatrix no hacia toUpperCase(), asi que un colaborador
   * cargado en minusculas ("Pepe re fr") salia como "Pr" en la matriz de
   * turnos y como "PR" en el resto de la app. Ahora hay una sola funcion.
   */
  it('siempre devuelve las iniciales en mayuscula, venga como venga el nombre', () => {
    expect(initialsOf('pepe re fr')).toBe('PR')
    expect(initialsOf('MARIA de los Angeles')).toBe('MD')
  })

  it('tolera espacios de más entre nombres', () => {
    expect(initialsOf('  Ana   Solis  ')).toBe('AS')
  })

  it('aplica la clase de tamaño según la prop size', () => {
    const { rerender } = render(<Avatar fotoUrl={null} nombre="X Y" size="sm" />)
    expect(screen.getByText('XY')).toHaveClass('h-8', 'w-8')

    rerender(<Avatar fotoUrl={null} nombre="X Y" size="xs" />)
    expect(screen.getByText('XY')).toHaveClass('h-7', 'w-7')

    rerender(<Avatar fotoUrl={null} nombre="X Y" size="lg" />)
    expect(screen.getByText('XY')).toHaveClass('h-16', 'w-16')

    rerender(<Avatar fotoUrl={null} nombre="X Y" size="xl" />)
    expect(screen.getByText('XY')).toHaveClass('h-24', 'w-24')
  })
})
