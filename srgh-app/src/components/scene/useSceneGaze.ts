import { useEffect, useRef, type RefObject } from 'react'

type Point = { x: number; y: number }

/**
 * Where a character should look this frame: a point on screen, a fixed
 * direction (-1..1 on each axis), or `null` to do its own thing (follow the
 * pointer, or look around when nothing is going on).
 */
export type GazeTarget = { point: Point } | { direction: Point } | null

/**
 * `anchor` is the face in viewBox units (where the gaze is measured from);
 * `stiffness`/`damping` are the spring that moves the gaze. Give each
 * character different values: heavy ones turn late, light ones overshoot.
 */
export type GazeActor = {
  anchor: readonly [number, number]
  stiffness: number
  damping: number
}

type ViewBox = { x: number; y: number; width: number; height: number }

/* Distance (px) at which a character is already looking as far as it can.
   Closer than that the gaze eases back to the center instead of snapping. */
const FULL_LOOK_DISTANCE = 160
/* Without pointer movement for this long, the characters start looking around. */
const POINTER_IDLE_MS = 2500
const POKE_MS = 650
const POKE_ATTENTION_MS = 1100
/* How long a measured position of the scene is trusted without a scroll or
   resize saying it moved. */
const BOX_MAX_AGE_MS = 400
/* While a gaze is moving it is updated on every frame of the screen, up to
   about 60 a second (a 120 Hz screen gets every other one). Fewer than that
   reads as stutter: pacing the loop with a timer was tried and the timer's
   own imprecision made the eyes jump. What keeps this cheap is not skipping
   frames but not running at all once the gazes have arrived (see below). */
const MIN_FRAME_MS = 12
/* A gaze this close to its target, and this slow, has arrived. */
const SETTLED_DISTANCE = 0.004
const SETTLED_SPEED = 0.02
/* How often a gaze that already rests on a point checks whether it moved. */
const POINT_RECHECK_MS = 120
/* Longest sleep of the loop, as a safety net. */
const IDLE_CHECK_MS = 30_000
/* How far the face slides inside the body, in SVG units, at full gaze. */
const FACE_SHIFT_X = 8
const FACE_SHIFT_Y = 6
/* Rough width of a typed character, to follow the text as it grows. */
const TYPED_CHAR_PX = 7.5

/**
 * Screen position of a form control, for a character to look at. Read from
 * the DOM by id instead of received as a ref because react-hook-form already
 * owns the refs of the fields. With `followText` it points at the end of
 * what has been typed, so the eyes travel along while writing.
 */
export function fieldPoint(id: string, followText: boolean): Point | null {
  const field = document.getElementById(id)
  if (!field) return null

  const box = field.getBoundingClientRect()
  const typed = followText && field instanceof HTMLInputElement ? field.value.length : 0
  const offset = followText ? 44 + Math.min(typed * TYPED_CHAR_PX, box.width - 90) : box.width / 2

  return { x: box.left + offset, y: box.top + box.height / 2 }
}

/**
 * Gaze simulation for an illustrated scene. Each `[data-character]` inside
 * the SVG gets something to look at and a spring carries its gaze there; the
 * result moves the pupils, the face and the lean of the body. React never
 * re-renders for it.
 *
 * It is written to be cheap, because it runs for as long as the scene is on
 * screen, and SVG is painted on the main thread:
 *  - the three parts that move get their `transform` written directly. An
 *    inherited CSS variable on the character would do the same, but every
 *    change of it recomputes the style of the whole character subtree;
 *  - a write is skipped when the rounded value did not change, so a settled
 *    gaze costs nothing;
 *  - once every gaze has arrived, the loop sleeps until the next thing that
 *    can move one (a character deciding to look elsewhere, the pointer, a
 *    poke, a scroll, a new target). The characters do not freeze meanwhile:
 *    floating, blinking and the rest are CSS animations, which keep playing;
 *  - the loop stops while the scene is off screen, and `data-live` on the
 *    SVG tells the stylesheet to pause its CSS animations too.
 *
 * `viewBox` and `actors` must be module constants (one actor per
 * `[data-character]`, in DOM order). `resolveTarget` may change every render.
 */
export function useSceneGaze(
  sceneRef: RefObject<SVGSVGElement | null>,
  viewBox: ViewBox,
  actors: readonly GazeActor[],
  resolveTarget: (index: number) => GazeTarget
) {
  const resolveRef = useRef(resolveTarget)
  const wakeRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    resolveRef.current = resolveTarget
    /* A render usually means the scene has something new to look at (a mood
       changed): a sleeping loop must notice. */
    wakeRef.current?.()
  })

  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return

    const elements = Array.from(scene.querySelectorAll<SVGGElement>('[data-character]'))
    const bodies = elements.map((element, index) => ({
      element,
      ...actors[index],
      /* The parts the gaze moves, and how far each one goes (both come from
         the markup: see Character and Eye in SceneParts). */
      lean: element.querySelector<SVGGElement>('.login-lean'),
      leanDeg: parseFloat(getComputedStyle(element).getPropertyValue('--lean')) || 0,
      face: element.querySelector<SVGGElement>('.login-face'),
      pupils: Array.from(element.querySelectorAll<SVGGElement>('.login-pupil')).map((node) => ({
        node,
        travel: parseFloat(getComputedStyle(node).getPropertyValue('--eye-travel')) || 4,
      })),
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      wanderX: 0,
      wanderY: 0,
      nextWanderAt: 0,
      /* Last rounded gaze written, to skip writes that change nothing. */
      written: '',
    }))

    const pointer = { x: 0, y: 0, movedAt: -Infinity }
    const poke = { index: -1, at: -Infinity }
    const pokeTimeouts = new Map<SVGGElement, ReturnType<typeof setTimeout>>()
    let frame = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    let lastTime = performance.now()
    let visible = true
    let sleeping = false

    /*
     * Where the scene is on screen. Measuring it forces layout, so it is kept
     * between frames and only measured again when it may have moved: on
     * scroll or resize, and every BOX_MAX_AGE_MS regardless — the page can
     * shift under the scene (a panel above growing) without either event.
     */
    let box: DOMRect | null = null
    let boxAt = 0
    const forgetBox = () => {
      box = null
    }

    /* Moves every gaze one step. Returns when the loop is next needed: 0 for
       "on the next frame", or the moment until which nothing can change. */
    const advance = (now: number): number => {
      const dt = Math.min(0.05, (now - lastTime) / 1000)
      lastTime = now

      if (!box || now - boxAt > BOX_MAX_AGE_MS) {
        box = scene.getBoundingClientRect()
        boxAt = now
      }
      if (box.width === 0 || box.height === 0) return 0

      /* The SVG letterboxes inside its box, so the drawing can be smaller
         than the element on either axis. */
      const scale = Math.min(box.width / viewBox.width, box.height / viewBox.height)
      const originX = box.left + (box.width - viewBox.width * scale) / 2
      const originY = box.top + (box.height - viewBox.height * scale) / 2
      const toClient = (anchor: readonly [number, number]) => ({
        x: originX + (anchor[0] - viewBox.x) * scale,
        y: originY + (anchor[1] - viewBox.y) * scale,
      })

      const pointerIsActive = now - pointer.movedAt < POINTER_IDLE_MS
      const someonePoked = now - poke.at < POKE_ATTENTION_MS
      let settled = true
      let wakeAt = Infinity
      if (pointerIsActive) wakeAt = pointer.movedAt + POINTER_IDLE_MS
      if (someonePoked) wakeAt = Math.min(wakeAt, poke.at + POKE_ATTENTION_MS)

      bodies.forEach((body, index) => {
        const center = toClient(body.anchor)
        let targetX = 0
        let targetY = 0

        const lookAt = (point: Point) => {
          const dx = point.x - center.x
          const dy = point.y - center.y
          const distance = Math.hypot(dx, dy)
          if (distance === 0) return
          const reach = Math.min(1, distance / FULL_LOOK_DISTANCE)
          targetX = (dx / distance) * reach
          targetY = (dy / distance) * reach
        }

        const target = resolveRef.current(index)

        if (someonePoked && index !== poke.index) {
          lookAt(toClient(bodies[poke.index].anchor))
        } else if (target && 'point' in target) {
          /* The point can move without anyone telling (text being typed):
             once there, the loop only looks again every so often. */
          wakeAt = Math.min(wakeAt, now + POINT_RECHECK_MS)
          lookAt(target.point)
        } else if (target) {
          targetX = target.direction.x
          targetY = target.direction.y
        } else if (pointerIsActive) {
          lookAt(pointer)
        } else {
          if (now > body.nextWanderAt) {
            const roll = Math.random()
            if (roll < 0.25) {
              body.wanderX = 0
              body.wanderY = 0
            } else if (roll < 0.55 && bodies.length > 1) {
              const step = 1 + Math.floor(Math.random() * (bodies.length - 1))
              const neighbor = bodies[(index + step) % bodies.length]
              const dx = neighbor.anchor[0] - body.anchor[0]
              const dy = neighbor.anchor[1] - body.anchor[1]
              const distance = Math.hypot(dx, dy)
              body.wanderX = (dx / distance) * 0.85
              body.wanderY = (dy / distance) * 0.85
            } else {
              const angle = Math.random() * Math.PI * 2
              const reach = 0.4 + Math.random() * 0.5
              body.wanderX = Math.cos(angle) * reach
              body.wanderY = Math.sin(angle) * reach * 0.7
            }
            body.nextWanderAt = now + 1200 + Math.random() * 2600
          }
          targetX = body.wanderX
          targetY = body.wanderY
          wakeAt = Math.min(wakeAt, body.nextWanderAt)
        }

        body.vx += (body.stiffness * (targetX - body.x) - body.damping * body.vx) * dt
        body.vy += (body.stiffness * (targetY - body.y) - body.damping * body.vy) * dt
        body.x += body.vx * dt
        body.y += body.vy * dt

        if (
          Math.abs(targetX - body.x) > SETTLED_DISTANCE ||
          Math.abs(targetY - body.y) > SETTLED_DISTANCE ||
          Math.abs(body.vx) > SETTLED_SPEED ||
          Math.abs(body.vy) > SETTLED_SPEED
        ) {
          settled = false
        }

        const key = `${body.x.toFixed(2)},${body.y.toFixed(2)}`
        if (key === body.written) return
        body.written = key

        if (body.lean) {
          body.lean.style.transform = `skewX(${(body.x * body.leanDeg).toFixed(2)}deg)`
        }
        if (body.face) {
          body.face.style.transform = `translate(${(body.x * FACE_SHIFT_X).toFixed(1)}px, ${(body.y * FACE_SHIFT_Y).toFixed(1)}px)`
        }
        for (const pupil of body.pupils) {
          pupil.node.style.transform = `translate(${(body.x * pupil.travel).toFixed(1)}px, ${(body.y * pupil.travel).toFixed(1)}px)`
        }
      })

      /* Settled with nothing scheduled: every character has a fixed direction
         to look in. Only a new target (a render) changes that. */
      return settled ? Math.min(wakeAt, now + IDLE_CHECK_MS) : 0
    }

    const requestFrame = () => {
      sleeping = false
      frame = requestAnimationFrame(step)
    }

    /* Back from a sleep: the time slept is not time the springs lived. */
    const resume = () => {
      lastTime = performance.now()
      requestFrame()
    }

    const step = (now: number) => {
      if (now - lastTime < MIN_FRAME_MS) {
        frame = requestAnimationFrame(step)
        return
      }

      const wakeAt = advance(now)
      if (wakeAt > 0) {
        sleeping = true
        timer = setTimeout(resume, wakeAt - now + 1)
      } else {
        frame = requestAnimationFrame(step)
      }
    }

    const halt = () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
      sleeping = false
    }

    /* Something that can move a gaze just happened: a sleeping loop resumes. */
    const wake = () => {
      if (!sleeping) return
      halt()
      lastTime = performance.now()
      requestFrame()
    }
    wakeRef.current = wake

    /* The loop runs, and the scene's CSS animations play, only while it is on
       screen. */
    const apply = () => {
      halt()
      scene.dataset.live = String(visible)
      if (!visible) return
      lastTime = performance.now()
      forgetBox()
      requestFrame()
    }

    /* A scroll moves the scene under a pointer that did not move. */
    const handleScroll = () => {
      forgetBox()
      wake()
    }

    /* Without IntersectionObserver (jsdom in tests) the scene counts as
       visible and the loop simply starts. */
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting
            apply()
          })
    observer?.observe(scene)

    const handlePointerMove = (event: PointerEvent) => {
      pointer.x = event.clientX
      pointer.y = event.clientY
      pointer.movedAt = performance.now()
      wake()
    }

    const handlePointerDown = (event: PointerEvent) => {
      const index = elements.findIndex((element) => element.contains(event.target as Node))
      if (index < 0) return

      const element = elements[index]
      poke.index = index
      poke.at = performance.now()
      wake()

      clearTimeout(pokeTimeouts.get(element))
      element.dataset.poked = ''
      pokeTimeouts.set(
        element,
        setTimeout(() => delete element.dataset.poked, POKE_MS)
      )
    }

    /* With an observer the loop starts from its first report instead. */
    if (!observer) apply()
    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    /* Capture: scrolling any ancestor moves the scene, not only the window. */
    window.addEventListener('scroll', handleScroll, { passive: true, capture: true })
    window.addEventListener('resize', forgetBox, { passive: true })
    scene.addEventListener('pointerdown', handlePointerDown)
    return () => {
      wakeRef.current = null
      halt()
      observer?.disconnect()
      window.removeEventListener('scroll', handleScroll, { capture: true })
      window.removeEventListener('resize', forgetBox)
      window.removeEventListener('pointermove', handlePointerMove)
      scene.removeEventListener('pointerdown', handlePointerDown)
      pokeTimeouts.forEach((timeout) => clearTimeout(timeout))
    }
  }, [sceneRef, viewBox, actors])
}
