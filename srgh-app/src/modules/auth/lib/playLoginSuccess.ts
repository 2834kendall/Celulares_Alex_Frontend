/**
 * Way out of the login once access is granted: the shapes cheer, the tall
 * blue one grows until it fills the screen, and then it lifts like a curtain
 * over the app.
 *
 * It runs on a frozen COPY of the login screen, in a layer appended to
 * <body>, and that is the whole point. A server action that sets the session
 * cookie makes Next re-render the route right away, and /login redirects
 * whoever is signed in: the real login screen is gone a few frames after the
 * action resolves, long before any animation on it could play (what showed
 * instead was the blank loading screen). The copy does not belong to React,
 * so it stays up while the app loads underneath — no time is added to the
 * sign-in, the wait just stops being blank.
 *
 * Does nothing when the user asked for reduced motion or the environment has
 * no Web Animations (jsdom in tests).
 */

/* The cheer (`login-cheer` in globals.css) lands at about this point. */
const GROW_AT_MS = 600
const GROW_MS = 650
const LIFT_MS = 700
/* Hold the full-blue frame this long once the destination is in place. */
const SETTLE_MS = 160
/* Give up waiting for the route change and lift anyway. */
const ROUTE_TIMEOUT_MS = 8000

const EASE = 'cubic-bezier(0.7, 0, 0.2, 1)'

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

/* Timers, not requestAnimationFrame or `animation.finished`: neither of
   those advances in a background tab, and the layer must always come off. */
function routeChanged(from: string) {
  return new Promise<void>((resolve) => {
    const startedAt = performance.now()
    const check = () => {
      if (location.pathname !== from || performance.now() - startedAt > ROUTE_TIMEOUT_MS) resolve()
      else setTimeout(check, 50)
    }
    check()
  })
}

export function playLoginSuccess(): void {
  const screen = document.querySelector<HTMLElement>('.login-screen')
  const reducedMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  if (!screen || typeof screen.animate !== 'function' || reducedMotion) return

  const layer = document.createElement('div')
  layer.className = 'auth-snapshot'
  layer.setAttribute('aria-hidden', 'true')
  layer.inert = true
  layer.style.cssText =
    'position:fixed;inset:0;z-index:2147483000;overflow:hidden;background:#fff;will-change:transform'

  const copy = screen.cloneNode(true) as HTMLElement
  /* What was typed is a property, not an attribute: cloning drops it. */
  const fields = screen.querySelectorAll('input')
  copy.querySelectorAll('input').forEach((field, index) => {
    field.value = fields[index]?.value ?? ''
  })
  /* No duplicated ids for the form controls while both copies coexist. The
     clipPath keeps its id: the scene references it by url(#…). */
  copy.querySelectorAll('input[id], button[id]').forEach((node) => node.removeAttribute('id'))
  copy.style.transform = `translateY(${-window.scrollY}px)`

  layer.append(copy)
  document.body.append(layer)

  void run(layer, copy, location.pathname)
}

async function run(layer: HTMLElement, copy: HTMLElement, startedOn: string) {
  await wait(GROW_AT_MS)

  const scene = copy.querySelector<SVGSVGElement>('.login-scene')
  const hero = scene?.querySelector<SVGGElement>('[data-hero]')
  const body = hero?.querySelector<SVGGElement>('.login-pop')

  if (scene && hero && body) {
    /* Let it out: of the panel, of the SVG, and of the group clipped at the
       ground. It goes right before that group, so it stays behind the rest. */
    const panel = scene.closest('section')
    if (panel) {
      panel.style.overflow = 'visible'
      panel.style.zIndex = '1'
    }
    scene.style.overflow = 'visible'
    const clipped = hero.parentNode
    if (clipped instanceof SVGGElement) scene.insertBefore(hero, clipped)

    const box = body.getBoundingClientRect()
    const centerX = box.left + box.width / 2
    const centerY = box.top + box.height / 2
    /* Enough to reach the farthest corner, plus slack for the rounded top. */
    const scale =
      1.4 *
      Math.max(
        (2 * Math.max(centerX, window.innerWidth - centerX)) / box.width,
        (2 * Math.max(centerY, window.innerHeight - centerY)) / box.height
      )

    body.style.transformOrigin = 'center'
    body.animate(
      [
        { transform: 'scale(1, 1)' },
        { offset: 0.22, transform: 'scale(1.14, 0.9)', easing: 'cubic-bezier(0.6, 0, 0.3, 1)' },
        { transform: `scale(${scale})` },
      ],
      { duration: GROW_MS, fill: 'forwards' }
    )
    /* The face would turn into two giant eyes: it bows out as it grows. */
    hero
      .querySelector('.login-face')
      ?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: 'forwards' })
  }

  await Promise.all([wait(GROW_MS), routeChanged(startedOn)])
  await wait(SETTLE_MS)

  layer.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-100%)' }], {
    duration: LIFT_MS,
    easing: EASE,
    fill: 'forwards',
  })
  await wait(LIFT_MS + 50)
  layer.remove()
}
