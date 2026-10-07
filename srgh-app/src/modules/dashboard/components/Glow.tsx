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

export function trackGlow(event: PointerEvent<HTMLElement>) {
  const card = event.currentTarget
  const spot = card.querySelector<HTMLElement>(':scope > .dash-glow-spot')
  if (!spot) return

  const box = card.getBoundingClientRect()
  spot.style.transform = `translate3d(${Math.round(event.clientX - box.left)}px, ${Math.round(event.clientY - box.top)}px, 0)`
}
