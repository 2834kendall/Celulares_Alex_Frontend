'use client'

import type { CSSProperties, ReactNode } from 'react'
import Link from 'next/link'
import { ArrowUpRight, type LucideIcon } from 'lucide-react'
import { CARD } from '@/components/ui/styles'
import { cn } from '@/lib/utils/cn'
import { GlowSpot, trackGlow } from '@/modules/dashboard/components/Glow'

/**
 * Frame of a dashboard panel: icon, title and the way into the module it
 * summarizes. Every panel is a doorway — the detail lives in the module.
 *
 * The card reacts as a whole to the pointer (lift, glow, the header icon
 * tilting): see `.dash-widget` in globals.css.
 */
export function WidgetCard({
  icon: Icon,
  title,
  href,
  step = 0,
  className,
  children,
}: {
  icon: LucideIcon
  title: string
  /** Module this panel summarizes. */
  href: string
  /** Position in the staggered entrance of the page (see `.dash-enter`). */
  step?: number
  className?: string
  children: ReactNode
}) {
  return (
    <section
      onPointerMove={trackGlow}
      className={cn(
        CARD,
        '@container dash-enter dash-widget dash-glow relative flex min-w-0 flex-col overflow-hidden p-4 @md:p-5',
        className
      )}
      style={{ '--i': step } as CSSProperties}
    >
      <GlowSpot />
      <header className="relative flex items-center gap-2">
        <span className="dash-widget-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 transition-colors duration-300">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <h2 className="min-w-0 truncate text-base font-extrabold tracking-tight text-slate-900">
          {title}
        </h2>
        <Link
          href={href}
          aria-label={`Abrir ${title}`}
          className="group ml-auto inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand-700 transition duration-200 hover:bg-brand-50 active:scale-95 pointer-coarse:min-h-10"
        >
          Abrir
          <ArrowUpRight
            className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            aria-hidden="true"
          />
        </Link>
      </header>
      <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  )
}
