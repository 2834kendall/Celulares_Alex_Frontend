import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TextoPlegable } from './TextoPlegable'
import { Alert } from './Alert'

/** jsdom no calcula tamaños: se simula que el texto recogido no cabe en 2 líneas. */
function simularMedidas(scrollHeight: number, clientHeight: number) {
  const sh = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight')
  const ch = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get: () => scrollHeight,
  })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => clientHeight,
  })
  return () => {
    if (sh) Object.defineProperty(HTMLElement.prototype, 'scrollHeight', sh)
    else delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollHeight
    if (ch) Object.defineProperty(HTMLElement.prototype, 'clientHeight', ch)
    else delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientHeight
  }
}

describe('TextoPlegable', () => {
  afterEach(cleanup)

  it('un texto que cabe se ve tal cual, sin botón', () => {
    const restaurar = simularMedidas(20, 20)
    try {
      render(<TextoPlegable>Texto corto</TextoPlegable>)
      expect(screen.getByText('Texto corto')).toBeTruthy()
      expect(screen.queryByRole('button')).toBeNull()
    } finally {
      restaurar()
    }
  })

  it('un texto largo arranca recogido y se abre y se recoge al tocarlo', () => {
    const restaurar = simularMedidas(80, 32)
    try {
      render(<TextoPlegable>Texto muy largo de prueba</TextoPlegable>)
      const boton = screen.getByRole('button')
      expect(boton.getAttribute('aria-expanded')).toBe('false')
      expect(screen.getByText('Texto muy largo de prueba').className).toContain('line-clamp-2')
      // `block` pisaría el display de line-clamp y el texto no se recogería.
      expect(screen.getByText('Texto muy largo de prueba').className).not.toMatch(/\bblock\b/)

      fireEvent.click(boton)
      expect(boton.getAttribute('aria-expanded')).toBe('true')
      expect(screen.getByText('Texto muy largo de prueba').className).not.toContain('line-clamp-2')

      fireEvent.click(boton)
      expect(boton.getAttribute('aria-expanded')).toBe('false')
      expect(screen.getByText('Texto muy largo de prueba').className).toContain('line-clamp-2')
    } finally {
      restaurar()
    }
  })

  it('también se abre con el teclado (Enter)', () => {
    const restaurar = simularMedidas(80, 32)
    try {
      render(<TextoPlegable>Texto largo</TextoPlegable>)
      const boton = screen.getByRole('button')
      fireEvent.keyDown(boton, { key: 'Enter' })
      expect(boton.getAttribute('aria-expanded')).toBe('true')
    } finally {
      restaurar()
    }
  })
})

describe('Alert con texto', () => {
  afterEach(cleanup)

  it('un mensaje de error en texto simple es plegable', () => {
    const restaurar = simularMedidas(80, 32)
    try {
      render(<Alert>Mensaje de error larguísimo</Alert>)
      expect(screen.getByRole('alert')).toBeTruthy()
      expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('false')
    } finally {
      restaurar()
    }
  })

  it('si trae un botón adentro no lo envuelve en otro botón', () => {
    const restaurar = simularMedidas(80, 32)
    try {
      render(
        <Alert>
          <span>Algo falló</span> <button type="button">Reintentar</button>
        </Alert>
      )
      expect(screen.getAllByRole('button')).toHaveLength(1)
      expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy()
    } finally {
      restaurar()
    }
  })
})
