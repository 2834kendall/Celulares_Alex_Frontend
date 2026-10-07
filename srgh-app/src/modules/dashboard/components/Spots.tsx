import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils/cn'

/**
 * Small animated vignettes, one per dashboard panel. Decorative (hidden from
 * assistive technology) and tinted with the `brand` scale, so they follow
 * the color of the branch. Their motion is under `dash-spot` in globals.css.
 */

const SPOT = 'h-12 w-12 shrink-0 overflow-visible'

/** A wall clock whose hands keep turning (faster while its panel is hovered). */
export function ClockSpot() {
  return (
    <svg viewBox="0 0 48 48" className={SPOT} aria-hidden="true" focusable="false">
      <circle cx={24} cy={24} r={20} fill="#fff" className="stroke-brand-600" strokeWidth={3} />
      <g className="stroke-brand-200" strokeWidth={2.5} strokeLinecap="round">
        <path d="M24 8 v3" />
        <path d="M24 37 v3" />
        <path d="M8 24 h3" />
        <path d="M37 24 h3" />
      </g>
      {/* The translate puts (0,0) at the center, where the hands turn. */}
      <g transform="translate(24 24)" strokeLinecap="round">
        <path className="dash-spot-hour stroke-brand-800" d="M0 0 v-8" strokeWidth={3.5} />
        <path className="dash-spot-minute stroke-brand-500" d="M0 0 v-13" strokeWidth={2.5} />
        <circle r={2.5} className="fill-brand-800" />
      </g>
    </svg>
  )
}

/**
 * A stack of coins that keeps getting one more. Bump `toss` to flip a coin
 * into the air: each value mounts a fresh coin, and mounting is what starts
 * its animation.
 */
export function CoinsSpot({ toss = 0 }: { toss?: number }) {
  return (
    <svg viewBox="0 0 48 48" className={SPOT} aria-hidden="true" focusable="false">
      <g className="stroke-brand-600" strokeWidth={2}>
        <ellipse cx={24} cy={38} rx={15} ry={5} className="fill-brand-200" />
        <ellipse cx={24} cy={31} rx={15} ry={5} className="fill-brand-100" />
        <ellipse cx={24} cy={24} rx={15} ry={5} className="dash-spot-coin fill-brand-200" />
        <ellipse
          cx={24}
          cy={17}
          rx={15}
          ry={5}
          className="dash-spot-coin dash-spot-coin-late fill-brand-100"
        />
        {toss > 0 && (
          /* The translate puts (0,0) at the coin, so it flips in place. */
          <g key={toss} transform="translate(24 12)">
            <ellipse rx={15} ry={5} className="dash-spot-toss fill-brand-300" />
          </g>
        )}
      </g>
    </svg>
  )
}

/**
 * A magnifying glass sweeping over a row of applicants. With `focus` (0–2)
 * it stops sweeping and holds over that applicant.
 */
export function SearchSpot({ focus = null }: { focus?: number | null }) {
  return (
    <svg viewBox="0 0 48 48" className={SPOT} aria-hidden="true" focusable="false">
      {[9, 24, 39].map((x, index) => (
        <g
          key={x}
          className={cn(
            'transition-colors duration-300',
            focus === index ? 'fill-brand-500' : 'fill-brand-200'
          )}
        >
          <circle cx={x} cy={22} r={5} />
          <rect x={x - 6} y={30} width={12} height={8} rx={4} />
        </g>
      ))}
      <g
        className="dash-spot-lens"
        data-held={focus !== null}
        style={{ '--at': `${(focus ?? 0) * 15}px` } as CSSProperties}
      >
        <circle
          cx={9}
          cy={24}
          r={10}
          fill="#fff"
          fillOpacity={0.55}
          className="stroke-brand-600"
          strokeWidth={3}
        />
        <path d="M16 32 l7 8" className="stroke-brand-600" strokeWidth={4} strokeLinecap="round" />
      </g>
    </svg>
  )
}

/** A medal swinging from its ribbon. */
export function MedalSpot() {
  return (
    <svg viewBox="0 0 48 48" className={SPOT} aria-hidden="true" focusable="false">
      {/* The translate puts (0,0) where the ribbon hangs from. */}
      <g transform="translate(24 4)">
        <g className="dash-spot-medal">
          <path d="M-9 0 L-3 18 L3 18 L9 0Z" className="fill-brand-300" />
          <path d="M-4 0 L0 12 L4 0Z" className="fill-brand-500" />
          <circle cy={28} r={13} className="fill-brand-600" />
          <circle cy={28} r={8.5} className="fill-brand-100" />
          <path
            d="M0 22.5 l1.8 3.7 l4 0.5 l-2.9 2.8 l0.7 4 l-3.6 -1.9 l-3.6 1.9 l0.7 -4 l-2.9 -2.8 l4 -0.5Z"
            className="fill-brand-600"
          />
        </g>
      </g>
    </svg>
  )
}

/** Three people standing together, bobbing one after another. */
export function TeamSpot() {
  return (
    <svg viewBox="0 0 48 48" className={SPOT} aria-hidden="true" focusable="false">
      {[
        { x: 10, tone: 'fill-brand-300', delay: '0s' },
        { x: 38, tone: 'fill-brand-300', delay: '0.5s' },
        { x: 24, tone: 'fill-brand-600', delay: '0.25s' },
      ].map(({ x, tone, delay }) => (
        <g key={x} className={`dash-spot-person ${tone}`} style={{ animationDelay: delay }}>
          <circle cx={x} cy={x === 24 ? 14 : 19} r={x === 24 ? 7 : 5.5} />
          <path
            d={
              x === 24 ? 'M11 44 v-8 a13 13 0 0 1 26 0 v8Z' : `M${x - 9} 44 v-6 a9 9 0 0 1 18 0 v6Z`
            }
          />
        </g>
      ))}
    </svg>
  )
}
