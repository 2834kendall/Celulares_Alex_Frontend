import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { GazeTarget } from '@/components/scene/useSceneGaze'
import { LoginScene } from './LoginScene'

/*
 * La simulacion de la mirada necesita layout real (jsdom mide todo en 0×0 y
 * el bucle no arranca), asi que se reemplaza el hook y se prueba lo que es de
 * la escena: hacia donde manda a mirar a cada figura segun el estado.
 */
const gaze = vi.hoisted(() => ({
  resolve: (() => null) as (index: number) => GazeTarget,
  fieldPoint: vi.fn<(id: string, followText: boolean) => { x: number; y: number } | null>(),
}))

vi.mock('@/components/scene/useSceneGaze', () => ({
  useSceneGaze: (
    _scene: unknown,
    _viewBox: unknown,
    _actors: unknown,
    resolve: (index: number) => GazeTarget
  ) => {
    gaze.resolve = resolve
  },
  fieldPoint: gaze.fieldPoint,
}))

const POINT = { x: 120, y: 40 }

describe('<LoginScene />', () => {
  beforeEach(() => {
    gaze.fieldPoint.mockReset().mockReturnValue(POINT)
  })

  it('expone el estado y si se esta escribiendo, para las reglas de globals.css', () => {
    const { container } = render(<LoginScene mood="watching" typing />)

    const scene = container.querySelector('svg')
    expect(scene).toHaveAttribute('data-mood', 'watching')
    expect(scene).toHaveAttribute('data-typing', 'true')
  })

  it('con la contraseña oculta miran para otro lado, cada una un poco distinto', () => {
    render(<LoginScene mood="hiding" />)

    expect(gaze.resolve(0)).toEqual({ direction: { x: -0.75, y: 0.45 } })
    expect(gaze.resolve(3)).not.toEqual(gaze.resolve(0))
    expect(gaze.fieldPoint).not.toHaveBeenCalled()
  })

  it.each([
    ['error', { x: 0, y: 1 }],
    ['success', { x: 0, y: -0.5 }],
  ] as const)('en %s miran en una direccion fija', (mood, direction) => {
    render(<LoginScene mood={mood} />)

    expect(gaze.resolve(0)).toEqual({ direction })
  })

  it.each([
    ['watching', 'email-input', true],
    ['peeking', 'pass-input', true],
    ['loading', 'submit-login', false],
  ] as const)('en %s miran el control #%s', (mood, id, followText) => {
    render(<LoginScene mood={mood} />)

    expect(gaze.resolve(0)).toEqual({ point: POINT })
    expect(gaze.fieldPoint).toHaveBeenCalledWith(id, followText)
  })

  it('si el control no esta en pantalla, quedan libres', () => {
    gaze.fieldPoint.mockReturnValue(null)
    render(<LoginScene mood="watching" />)

    expect(gaze.resolve(0)).toBeNull()
  })

  it('en reposo quedan libres (siguen el puntero o miran alrededor)', () => {
    render(<LoginScene mood="idle" />)

    expect(gaze.resolve(0)).toBeNull()
    expect(gaze.fieldPoint).not.toHaveBeenCalled()
  })
})
