import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { Clock } from 'lucide-react'
import type { GazeTarget } from '@/components/scene/useSceneGaze'
import { StateScene, type StateKind } from './StateScene'
import { LOOK_AROUND, LOOK_STEP_MS } from './states/LostScene'

/*
 * El bucle de la mirada necesita layout real (jsdom mide todo en 0×0): se
 * reemplaza el hook y se prueba lo que es de cada escena, incluido hacia
 * donde manda a mirar. Mismo enfoque que LoginScene.test.
 */
const gaze = vi.hoisted(() => ({
  resolve: (() => null) as (index: number) => GazeTarget,
  actors: [] as readonly unknown[],
}))

vi.mock('@/components/scene/useSceneGaze', () => ({
  useSceneGaze: (
    _scene: unknown,
    _viewBox: unknown,
    actors: readonly unknown[],
    resolve: (index: number) => GazeTarget
  ) => {
    gaze.actors = actors
    gaze.resolve = resolve
  },
}))

const KINDS: [StateKind, string][] = [
  ['empty', 'sleeping'],
  ['no-results', 'confused'],
  ['not-found', 'lost'],
  ['forbidden', 'stern'],
  ['error', 'error'],
]

const sceneOf = (container: HTMLElement) => container.querySelector('svg.state-scene')!

describe('<StateScene />', () => {
  it.each(KINDS)('%s: su expresión y una figura por actor de la mirada', (kind, mood) => {
    const { container } = render(<StateScene kind={kind} />)

    const scene = sceneOf(container)
    expect(scene).toHaveClass('login-scene', `state-${kind}`)
    expect(scene).toHaveAttribute('data-mood', mood)
    expect(scene).toHaveAttribute('aria-hidden', 'true')
    // Una figura de más que actores rompe la simulación (ver useSceneGaze).
    expect(scene.querySelectorAll('[data-character]')).toHaveLength(gaze.actors.length)
  })

  it('los cuerpos se recortan en el piso con un id propio por escena', () => {
    const { container } = render(
      <>
        <StateScene kind="empty" />
        <StateScene kind="empty" />
      </>
    )

    const ids = Array.from(container.querySelectorAll('clipPath')).map((clip) => clip.id)
    expect(new Set(ids).size).toBe(2)
    for (const id of ids) {
      expect(id).toMatch(/^[\w-]+$/)
      expect(container.querySelector(`[clip-path="url(#${id})"]`)).not.toBeNull()
    }
  })

  it('vacío: estampa el ícono de la pantalla en la caja', () => {
    const { container } = render(
      <StateScene kind="empty">
        <Clock />
      </StateScene>
    )

    expect(sceneOf(container).querySelector('.lucide-clock')).not.toBeNull()
  })

  it('vacío: dormida no sigue al puntero, queda con la cabeza gacha', () => {
    render(<StateScene kind="empty" />)

    expect(gaze.resolve(0)).toEqual({ direction: { x: 0.15, y: 0.4 } })
  })

  it.each(['no-results', 'forbidden', 'error'] as const)(
    '%s: la mirada queda libre (sigue al puntero)',
    (kind) => {
      render(<StateScene kind={kind} />)

      expect(gaze.resolve(0)).toBeNull()
    }
  )

  describe('404', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
      vi.unstubAllGlobals()
    })

    it('mira para todos lados, por turnos', () => {
      render(<StateScene kind="not-found" />)
      expect(gaze.resolve(0)).toBeNull()

      for (const direction of [...LOOK_AROUND, LOOK_AROUND[0]]) {
        act(() => vi.advanceTimersByTime(LOOK_STEP_MS))
        expect(gaze.resolve(0)).toEqual({ direction })
      }
    })

    it('con movimiento reducido no recorre: la mirada queda libre', () => {
      vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query }))
      render(<StateScene kind="not-found" />)

      act(() => vi.advanceTimersByTime(LOOK_STEP_MS * 3))

      expect(gaze.resolve(0)).toBeNull()
    })

    it('al desmontar no deja el temporizador corriendo', () => {
      const { unmount } = render(<StateScene kind="not-found" />)

      unmount()

      expect(vi.getTimerCount()).toBe(0)
    })
  })
})
