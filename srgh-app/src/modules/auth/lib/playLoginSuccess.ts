/**
 * Way out of the login once access is granted: the shapes cheer and dive
 * behind the floor, the floor line draws itself away after them, and then
 * the two halves of the screen —the scene and the card— slide apart like
 * doors, opening onto the app.
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
 * The cheer and the floor line are CSS, keyed on `data-mood='success'` (see
 * globals.css): the copy plays them by itself. Only the doors are driven
 * from here, and they only move `transform`, so the browser slides two
 * already-painted layers without drawing anything again.
 *
 * Does nothing when the user asked for reduced motion or the environment has
 * no Web Animations (jsdom in tests).
 */

/* The cheer and the floor line (globals.css) are over by this point. */
const CHEER_MS = 1150
const OPEN_MS = 720
/* A beat between the app being in place and the doors opening onto it. */
const SETTLE_MS = 120
/* Give up waiting for the route change and open anyway. */
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
  layer.style.cssText = 'position:fixed;inset:0;z-index:2147483000;overflow:hidden'

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

  /* Side by side or stacked: measured on the real screen, before it goes. */
  const [first, second] = Array.from(screen.children) as HTMLElement[]
  const sideBySide =
    first && second
      ? first.getBoundingClientRect().right <= second.getBoundingClientRect().left + 1
      : true

  layer.append(copy)
  document.body.append(layer)

  void run(layer, copy, sideBySide, location.pathname)
}

async function run(layer: HTMLElement, copy: HTMLElement, sideBySide: boolean, startedOn: string) {
  const doors = Array.from(copy.children).filter(
    (node): node is HTMLElement => node instanceof HTMLElement
  )

  /* Each half carries its own background from now on: the screen behind
     them has to be see-through once they start moving apart. */
  for (const door of doors) {
    door.style.backgroundColor = getComputedStyle(door).backgroundColor
    if (door.style.backgroundColor === 'rgba(0, 0, 0, 0)') door.style.backgroundColor = '#fff'
    door.style.willChange = 'transform'
  }

  await Promise.all([wait(CHEER_MS), routeChanged(startedOn)])
  await wait(SETTLE_MS)

  copy.style.backgroundColor = 'transparent'
  doors.forEach((door, index) => {
    const away = index === 0 ? '-101%' : '101%'
    door.animate(
      [
        { transform: 'none' },
        { transform: sideBySide ? `translateX(${away})` : `translateY(${away})` },
      ],
      { duration: OPEN_MS, easing: EASE, fill: 'forwards' }
    )
  })

  await wait(OPEN_MS + 50)
  layer.remove()
}
