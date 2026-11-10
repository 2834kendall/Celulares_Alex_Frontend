import { describe, expect, it } from 'vitest'
import { notFound, redirect } from 'next/navigation'
import { isNextNavigation } from './isNextNavigation'

/** El error real que lanza Next: un digest escrito a mano no probaría nada si cambia. */
function lanzado(fn: () => never): unknown {
  try {
    fn()
  } catch (error) {
    return error
  }
  throw new Error('no lanzó')
}

describe('isNextNavigation', () => {
  it('reconoce una redirección', () => {
    expect(isNextNavigation(lanzado(() => redirect('/unauthorized')))).toBe(true)
  })

  it('reconoce un notFound', () => {
    expect(isNextNavigation(lanzado(() => notFound()))).toBe(true)
  })

  it('una falla de red no es una navegación', () => {
    expect(isNextNavigation(new TypeError('Failed to fetch'))).toBe(false)
  })

  it('un error cualquiera, o algo que no es un error, tampoco', () => {
    expect(isNextNavigation(new Error('NEXT_REDIRECT'))).toBe(false)
    expect(isNextNavigation('NEXT_REDIRECT')).toBe(false)
    expect(isNextNavigation(undefined)).toBe(false)
  })
})
