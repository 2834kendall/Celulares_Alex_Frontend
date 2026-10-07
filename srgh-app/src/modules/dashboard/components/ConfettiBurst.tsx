import type { CSSProperties } from 'react'

const PIECES = 30
const COLORS = ['#f59e0b', '#fb7185', '#34d399', '#38bdf8', 'var(--color-brand-400)', '#a78bfa']

/* Deterministic "random" from the piece index: the burst looks scattered but
   renders the same on every pass (no Math.random during render). */
function scatter(index: number, salt: number) {
  const value = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453
  return value - Math.floor(value)
}

/**
 * One-shot burst of confetti from the center of its positioned parent.
 * Bump `burst` to fire it again: each value mounts a fresh set of pieces, and
 * mounting is what starts the CSS animation (`dash-confetti` in globals.css).
 * Renders nothing until the first burst.
 */
export function ConfettiBurst({ burst }: { burst: number }) {
  if (burst === 0) return null

  return (
    <span key={burst} className="dash-confetti" aria-hidden="true">
      {Array.from({ length: PIECES }, (_, index) => {
        const angle = scatter(index, 1) * Math.PI * 2
        const reach = 60 + scatter(index, 2) * 110

        return (
          <i
            key={index}
            style={
              {
                '--dx': `${Math.round(Math.cos(angle) * reach)}px`,
                '--dy': `${Math.round(Math.sin(angle) * reach - 50)}px`,
                '--spin': `${Math.round(scatter(index, 3) * 720 - 360)}deg`,
                '--delay': `${Math.round(scatter(index, 4) * 120)}ms`,
                background: COLORS[index % COLORS.length],
                width: 5 + Math.round(scatter(index, 5) * 5),
                height: 8 + Math.round(scatter(index, 6) * 6),
                borderRadius: index % 3 === 0 ? '50%' : 2,
              } as CSSProperties
            }
          />
        )
      })}
    </span>
  )
}
