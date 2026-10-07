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
 * Gaze simulation for an illustrated scene. Every frame each
 * `[data-character]` inside the SVG gets something to look at and a spring
 * carries its gaze there. The result goes straight to `--look-x`/`--look-y`
 * on the node: the stylesheet turns them into pupil, face and body movement
 * (see the `login-` rules in globals.css), and React never re-renders for it.
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

  useEffect(() => {
    resolveRef.current = resolveTarget
  })

  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return

    const elements = Array.from(scene.querySelectorAll<SVGGElement>('[data-character]'))
    const bodies = elements.map((element, index) => ({
      element,
      ...actors[index],
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      wanderX: 0,
      wanderY: 0,
      nextWanderAt: 0,
    }))

    const pointer = { x: 0, y: 0, movedAt: -Infinity }
    const poke = { index: -1, at: -Infinity }
    const pokeTimeouts = new Map<SVGGElement, ReturnType<typeof setTimeout>>()
    let frame = 0
    let lastTime = performance.now()

    const step = (now: number) => {
      frame = requestAnimationFrame(step)
      const dt = Math.min(0.032, (now - lastTime) / 1000)
      lastTime = now

      const box = scene.getBoundingClientRect()
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

        body.element.style.setProperty('--look-x', body.x.toFixed(3))
        body.element.style.setProperty('--look-y', body.y.toFixed(3))
      })
    }

    const handlePointerMove = (event: PointerEvent) => {
      pointer.x = event.clientX
      pointer.y = event.clientY
      pointer.movedAt = performance.now()
    }

    const handlePointerDown = (event: PointerEvent) => {
      const index = elements.findIndex((element) => element.contains(event.target as Node))
      if (index < 0) return

      const element = elements[index]
      poke.index = index
      poke.at = performance.now()

      clearTimeout(pokeTimeouts.get(element))
      element.dataset.poked = ''
      pokeTimeouts.set(
        element,
        setTimeout(() => delete element.dataset.poked, POKE_MS)
      )
    }

    frame = requestAnimationFrame(step)
    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    scene.addEventListener('pointerdown', handlePointerDown)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', handlePointerMove)
      scene.removeEventListener('pointerdown', handlePointerDown)
      pokeTimeouts.forEach((timeout) => clearTimeout(timeout))
    }
  }, [sceneRef, viewBox, actors])
}
