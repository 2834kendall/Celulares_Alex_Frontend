import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { GazeTarget } from '@/components/scene/useSceneGaze'
import { RecoveryScene } from './RecoveryScene'

/* Mismo enfoque que LoginScene.test: el bucle de la mirada no corre en jsdom,
   se prueba hacia donde manda a mirar la escena en cada estado. */
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

describe('<RecoveryScene />', () => {
  beforeEach(() => {
    gaze.fieldPoint.mockReset().mockReturnValue(POINT)
  })

  it('expone el estado y si se esta escribiendo, para las reglas de globals.css', () => {
    const { container } = render(<RecoveryScene mood="sent" typing />)

    const scene = container.querySelector('svg')
    expect(scene).toHaveAttribute('data-mood', 'sent')
    expect(scene).toHaveAttribute('data-typing', 'true')
  })

  it.each([
    // Abatidos, hacia el suelo.
    ['error', { x: 0, y: 1 }],
    // Siguen al sobre, que se va volando hacia arriba a la derecha.
    ['sent', { x: 0.75, y: -0.65 }],
  ] as const)('en %s miran en una direccion fija', (mood, direction) => {
    render(<RecoveryScene mood={mood} />)

    expect(gaze.resolve(0)).toEqual({ direction })
    expect(gaze.fieldPoint).not.toHaveBeenCalled()
  })

  it.each([
    ['watching', 'recovery-email-input', true],
    ['loading', 'recovery-submit', false],
  ] as const)('en %s miran el control #%s', (mood, id, followText) => {
    render(<RecoveryScene mood={mood} />)

    expect(gaze.resolve(0)).toEqual({ point: POINT })
    expect(gaze.fieldPoint).toHaveBeenCalledWith(id, followText)
  })

  it('si el control no esta en pantalla, quedan libres', () => {
    gaze.fieldPoint.mockReturnValue(null)
    render(<RecoveryScene mood="watching" />)

    expect(gaze.resolve(0)).toBeNull()
  })

  it('en reposo quedan libres', () => {
    render(<RecoveryScene mood="idle" />)

    expect(gaze.resolve(0)).toBeNull()
    expect(gaze.fieldPoint).not.toHaveBeenCalled()
  })
})
