import type { PointerEvent } from 'react'

/**
 * Soft light that follows the pointer over a card.
 *
 * It is a real element moved with `transform`, not a gradient repositioned
 * through CSS variables on the card: a variable on the card is inherited, so
 * every pointer move recomputed the style of everything inside it and
 * repainted the whole card. A transform on a single layer is moved by the
 * compositor — nothing is recalculated or repainted.
 *
 * Usage: put <GlowSpot /> as a direct child of a positioned, overflow-hidden
 * element with the `dash-glow` class, and pass `trackGlow` as its
 * onPointerMove.
 */
export function GlowSpot() {
  return <span aria-hidden="true" className="dash-glow-spot" />
}

/* The card under the pointer. Only one card is tracked at a time, so one
   module-level record is enough. */
let tracked: {
  card: HTMLElement
  spot: HTMLElement
  left: number
  top: number
  measuredAt: number
} | null = null
let pending: { x: number; y: number } | null = null
let frame = 0
let listening = false

/* How long a measured position of the card is trusted. The page can shift
   under it without a scroll (a panel above growing). */
const BOX_MAX_AGE_MS = 400

/* A scroll or a resize moves the card under the pointer: measure again. */
function forget() {
  tracked = null
}

function flush() {
  frame = 0
  if (!tracked || !pending) return
  tracked.spot.style.transform = `translate3d(${Math.round(pending.x - tracked.left)}px, ${Math.round(pending.y - tracked.top)}px, 0)`
}

/**
 * A pointer can report several moves per frame, and measuring the card on
 * each one forces the browser to lay the page out right there. So the card
 * is measured when the pointer enters it (and again every so often), and the
 * light is moved once per frame, to the last position reported.
 */
export function trackGlow(event: PointerEvent<HTMLElement>) {
  const card = event.currentTarget

  if (tracked?.card !== card || event.timeStamp - tracked.measuredAt > BOX_MAX_AGE_MS) {
    const spot = card.querySelector<HTMLElement>(':scope > .dash-glow-spot')
    if (!spot) return

    if (!listening) {
      listening = true
      window.addEventListener('scroll', forget, { passive: true, capture: true })
      window.addEventListener('resize', forget, { passive: true })
    }
    const box = card.getBoundingClientRect()
    tracked = { card, spot, left: box.left, top: box.top, measuredAt: event.timeStamp }
  }

  pending = { x: event.clientX, y: event.clientY }
  if (!frame) frame = requestAnimationFrame(flush)
}
