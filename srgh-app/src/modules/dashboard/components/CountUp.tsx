'use client'

import { useEffect, useRef } from 'react'

const DURATION_MS = 700

/**
 * A number that counts up to its value when it appears.
 *
 * The real value is what gets rendered (server HTML, no-JS, screen readers);
 * the count is painted over it by writing to the node directly, so there is
 * no state, no re-render per frame and no layout shift. Skipped entirely when
 * the user asked for reduced motion.
 */
export function CountUp({ value }: { value: number }) {
  const nodeRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const node = nodeRef.current
    if (!node || value <= 0) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    /* A tab in the background does not run animation frames: the count would
       sit at 0 until someone looked. There the real value simply stays. */
    if (document.hidden) return

    let frame = 0
    const startedAt = performance.now()

    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / DURATION_MS)
      /* Ease-out: fast at first, settling onto the final number. */
      const eased = 1 - (1 - progress) ** 3
      node.textContent = String(Math.round(value * eased))
      if (progress < 1) frame = requestAnimationFrame(step)
    }

    frame = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(frame)
      node.textContent = String(value)
    }
  }, [value])

  return (
    <span ref={nodeRef} className="tabular-nums">
      {value}
    </span>
  )
}
