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
/* With nothing to react to for this long, the scene goes to rest: see below. */
const REST_AFTER_MS = 10_000
const POKE_MS = 650
const POKE_ATTENTION_MS = 1100
/* How long a measured position of the scene is trusted without a scroll or
   resize saying it moved. */
const BOX_MAX_AGE_MS = 400
/* The gaze is updated at most this often (~30 per second). Eyes are small
   and the spring already smooths them: twice as often costs twice the style
   and paint work and cannot be told apart. */
const MIN_FRAME_MS = 30
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
 *  - updates are capped at ~30 per second;
 *  - the loop stops while the scene is off screen, and when there has been
 *    nothing to react to for a while (it "rests"). `data-live` on the SVG
 *    tells the stylesheet to pause the scene's CSS animations in both cases.
 *    Any pointer movement, or a new target, wakes it up.
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
    /* A render usually means the scene has something new to react to (a mood
       changed): a resting scene must notice. */
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
    let lastTime = performance.now()
    let lastBusyAt = lastTime
    let visible = true
    let resting = false

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

    const step = (now: number) => {
      frame = requestAnimationFrame(step)
      if (now - lastTime < MIN_FRAME_MS) return
      const dt = Math.min(0.05, (now - lastTime) / 1000)
      lastTime = now

      if (!box || now - boxAt > BOX_MAX_AGE_MS) {
        box = scene.getBoundingClientRect()
        boxAt = now
      }
      if (box.width === 0 || box.height === 0) return

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
      let busy = pointerIsActive || someonePoked

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
        if (target) busy = true

        if (someonePoked && index !== poke.index) {
          lookAt(toClient(bodies[poke.index].anchor))
        } else if (target && 'point' in target) {
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
        }

        body.vx += (body.stiffness * (targetX - body.x) - body.damping * body.vx) * dt
        body.vy += (body.stiffness * (targetY - body.y) - body.damping * body.vy) * dt
        body.x += body.vx * dt
        body.y += body.vy * dt

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

      if (busy) lastBusyAt = now
      else if (now - lastBusyAt > REST_AFTER_MS) setResting(true)
    }

    /* The loop runs, and the scene's CSS animations play, only while it is on
       screen and awake. */
    const apply = () => {
      const live = visible && !resting
      cancelAnimationFrame(frame)
      scene.dataset.live = String(live)
      if (!live) return
      lastTime = performance.now()
      lastBusyAt = lastTime
      forgetBox()
      frame = requestAnimationFrame(step)
    }

    const setResting = (next: boolean) => {
      if (resting === next) return
      resting = next
      apply()
    }

    wakeRef.current = () => setResting(false)

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
      setResting(false)
    }

    const handlePointerDown = (event: PointerEvent) => {
      const index = elements.findIndex((element) => element.contains(event.target as Node))
      if (index < 0) return

      const element = elements[index]
      poke.index = index
      poke.at = performance.now()
      setResting(false)

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
    window.addEventListener('scroll', forgetBox, { passive: true, capture: true })
    window.addEventListener('resize', forgetBox, { passive: true })
    scene.addEventListener('pointerdown', handlePointerDown)
    return () => {
      wakeRef.current = null
      cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener('scroll', forgetBox, { capture: true })
      window.removeEventListener('resize', forgetBox)
      window.removeEventListener('pointermove', handlePointerMove)
      scene.removeEventListener('pointerdown', handlePointerDown)
      pokeTimeouts.forEach((timeout) => clearTimeout(timeout))
    }
  }, [sceneRef, viewBox, actors])
}
