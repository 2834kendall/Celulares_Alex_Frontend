// @vitest-environment jsdom
/*
 * lib/ corre en el proyecto "node" (vitest.config.ts), pero lo que se prueba
 * aca es DOM puro: la copia de la pantalla y las puertas. Sin el setup del
 * proyecto "dom", asi que van matchers de Vitest y no los de jest-dom.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { playLoginSuccess } from './playLoginSuccess'

/* jsdom no trae Web Animations: se instala uno falso en cada test. */
const animate = vi.fn()

/* Las dos mitades de AuthShell: la escena y la tarjeta. */
const SCENE_AND_CARD = `
  <section style="background-color: rgb(36, 58, 130)">
    <svg><clipPath id="login-ground-clip"></clipPath></svg>
  </section>
  <div style="background-color: rgba(0, 0, 0, 0)">
    <input id="email-input" />
    <button id="submit-login">Iniciar sesion</button>
  </div>`

function mountScreen(html = SCENE_AND_CARD) {
  const screen = document.createElement('main')
  screen.className = 'login-screen'
  screen.innerHTML = html
  document.body.append(screen)
  return screen
}

/* jsdom mide todo en 0×0: la disposicion se declara a mano. */
function layOut(screen: HTMLElement, layout: 'side-by-side' | 'stacked') {
  const [scene, card] = Array.from(screen.children)
  vi.spyOn(scene, 'getBoundingClientRect').mockReturnValue({ right: 640 } as DOMRect)
  vi.spyOn(card, 'getBoundingClientRect').mockReturnValue({
    left: layout === 'side-by-side' ? 640 : 0,
  } as DOMRect)
}

const snapshot = () => document.querySelector<HTMLElement>('.auth-snapshot')
const copyOf = () => snapshot()!.firstElementChild as HTMLElement
/* Hacia donde se fue cada puerta, en orden. */
const doorMoves = () => animate.mock.calls.map(([keyframes]) => keyframes[1].transform)

describe('playLoginSuccess', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      value: animate,
      configurable: true,
      writable: true,
    })
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query }))
    history.replaceState(null, '', '/login')
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    Reflect.deleteProperty(HTMLElement.prototype, 'animate')
    animate.mockClear()
    document.body.innerHTML = ''
    history.replaceState(null, '', '/')
  })

  it('sin la pantalla de login no hace nada', () => {
    playLoginSuccess()

    expect(snapshot()).toBeNull()
  })

  it('con movimiento reducido no hace nada', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query }))
    mountScreen()

    playLoginSuccess()

    expect(snapshot()).toBeNull()
  })

  it('sin Web Animations no hace nada', () => {
    Reflect.deleteProperty(HTMLElement.prototype, 'animate')
    mountScreen()

    playLoginSuccess()

    expect(snapshot()).toBeNull()
  })

  it('tapa la pantalla con una copia inerte que conserva lo escrito', () => {
    const screen = mountScreen()
    screen.querySelector('input')!.value = 'ana@empresa.com'
    vi.stubGlobal('scrollY', 120)

    playLoginSuccess()

    const layer = snapshot()!
    expect(layer.parentElement).toBe(document.body)
    expect(layer.getAttribute('aria-hidden')).toBe('true')
    expect(layer.inert).toBe(true)
    // El valor tipeado es una propiedad, no un atributo: el clon lo pierde.
    expect(copyOf().querySelector('input')!.value).toBe('ana@empresa.com')
    // Queda donde estaba la pagina, aunque se hubiera desplazado.
    expect(copyOf().style.transform).toBe('translateY(-120px)')
  })

  it('no duplica los ids de los controles, pero el clipPath conserva el suyo', () => {
    mountScreen()

    playLoginSuccess()

    expect(document.querySelectorAll('#email-input')).toHaveLength(1)
    expect(document.querySelectorAll('#submit-login')).toHaveLength(1)
    // La escena lo referencia con url(#…): sin id, el suelo deja de recortar.
    // Por atributo y no con `#`: con el id repetido, jsdom resuelve `#` con
    // getElementById, que devuelve el original y no el de la copia.
    expect(copyOf().querySelector('[id="login-ground-clip"]')).not.toBeNull()
  })

  it('cada mitad lleva su propio fondo, y la transparente pasa a blanco', () => {
    mountScreen()

    playLoginSuccess()

    const [scene, card] = Array.from(copyOf().children) as HTMLElement[]
    expect(scene.style.backgroundColor).toBe('rgb(36, 58, 130)')
    expect(card.style.backgroundColor).toBe('rgb(255, 255, 255)')
  })

  it('espera a la app para abrir las puertas, y despues se retira', async () => {
    layOut(mountScreen(), 'side-by-side')
    playLoginSuccess()

    await vi.advanceTimersByTimeAsync(2000)
    // La ovacion termino, pero la app todavia no esta debajo.
    expect(animate).not.toHaveBeenCalled()

    history.pushState(null, '', '/dashboard')
    await vi.advanceTimersByTimeAsync(200)
    expect(doorMoves()).toEqual(['translateX(-101%)', 'translateX(101%)'])
    expect(animate).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ duration: 720, fill: 'forwards' })
    )
    expect(snapshot()).not.toBeNull()

    await vi.advanceTimersByTimeAsync(800)
    expect(snapshot()).toBeNull()
  })

  it('aunque la app llegue enseguida, la ovacion termina primero', async () => {
    mountScreen()
    playLoginSuccess()
    history.pushState(null, '', '/dashboard')

    // 1150 ms de ovacion + 120 de pausa.
    await vi.advanceTimersByTimeAsync(1269)
    expect(animate).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(animate).toHaveBeenCalledTimes(2)
  })

  it('si la ruta nunca cambia, abre igual pasados 8 s', async () => {
    mountScreen()
    playLoginSuccess()

    await vi.advanceTimersByTimeAsync(7999)
    expect(animate).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(300)
    expect(animate).toHaveBeenCalledTimes(2)
  })

  it('apiladas (pantalla angosta), las puertas se abren hacia arriba y abajo', async () => {
    layOut(mountScreen(), 'stacked')
    playLoginSuccess()
    history.pushState(null, '', '/dashboard')

    await vi.advanceTimersByTimeAsync(1270)

    expect(doorMoves()).toEqual(['translateY(-101%)', 'translateY(101%)'])
  })

  it('una pantalla sin dos mitades se abre como una sola puerta', async () => {
    mountScreen('<div>Cargando</div>')
    playLoginSuccess()
    history.pushState(null, '', '/dashboard')

    await vi.advanceTimersByTimeAsync(1270)

    expect(doorMoves()).toEqual(['translateX(-101%)'])
  })
})
