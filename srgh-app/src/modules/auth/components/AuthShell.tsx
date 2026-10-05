import type { CSSProperties, ReactNode } from 'react'
import { brandConfig, loginScreenContent } from '@/modules/auth/constants'

/**
 * Frame shared by the public auth screens: an illustrated panel plus the
 * card that holds the form. It owns ALL the responsive behavior, so the
 * forms inside only describe their fields.
 *
 * Three layouts, picked by the `auth-wide` / `auth-short` variants declared
 * in globals.css:
 *  - stacked (phones and tablets in portrait): scene on top, card below. The scene takes
 *    whatever height is left, so the whole screen fits without scrolling.
 *  - side by side (`auth-wide`: desktop, and anything in landscape).
 *  - compact (`auth-short`: low viewports): tighter paddings and type.
 *
 * Height is `min-h-dvh`, not `min-h-screen`: on phones `100vh` includes the
 * area under the browser bars, which is what forced a scroll before.
 */
export function AuthShell({ scene, children }: { scene: ReactNode; children: ReactNode }) {
  return (
    <main className="login-screen flex min-h-dvh flex-col bg-white font-sans text-slate-800 auth-wide:flex-row">
      <section className="relative flex min-h-0 flex-1 flex-col overflow-clip bg-brand-50 px-5 pt-5 text-(--login-ink) auth-wide:min-h-dvh auth-wide:w-[54%] auth-wide:flex-none auth-wide:px-8 auth-wide:pt-8 xl:px-12 xl:pt-12 auth-short:px-6 auth-short:pt-5">
        <div className="absolute inset-0 bg-[radial-gradient(var(--color-brand-200)_1px,transparent_1px)] bg-[size:22px_22px] opacity-60 [mask-image:linear-gradient(to_bottom,black,transparent_70%)]" />

        <div className="relative flex items-center gap-2.5">
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-xl text-lg font-bold text-white auth-short:h-8 auth-short:w-8 auth-short:text-base ${brandConfig.accent}`}
          >
            {brandConfig.logo}
          </span>
          <h1 className="text-xl font-black tracking-tight">{loginScreenContent.title}</h1>
        </div>

        {/* The scene is absolutely positioned inside this box (see the scene
            components), so it scales to the space left instead of asking for
            a height of its own. */}
        <div className="relative mx-auto mt-2 min-h-20 w-full max-w-3xl flex-1 auth-wide:my-6 auth-short:my-2">
          {scene}
        </div>
      </section>

      <section className="relative flex shrink-0 items-center justify-center overflow-clip px-4 pt-4 pb-5 auth-wide:flex-1 auth-wide:p-6 xl:p-12 auth-short:p-3">
        <div className="login-blob absolute -top-24 -right-20 h-72 w-72 rounded-full bg-brand-100 blur-3xl" />
        <div className="login-blob login-blob-late absolute -bottom-28 -left-16 h-64 w-64 rounded-full bg-brand-50 blur-3xl" />

        <div className="login-card relative w-full max-w-md space-y-5 rounded-3xl border border-slate-100 bg-white p-5 shadow-[0_30px_70px_-30px_rgba(36,58,130,0.35)] sm:p-7 auth-wide:space-y-6 auth-wide:p-9 auth-short:space-y-3 auth-short:rounded-2xl auth-short:p-4">
          {children}
        </div>
      </section>
    </main>
  )
}

/* Form pieces shared by the screens that live inside the shell. */

export const AUTH_TITLE =
  'text-2xl font-black tracking-tight text-(--login-ink) sm:text-3xl auth-short:text-xl'

export const AUTH_FIELD_LABEL =
  'block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1.5 auth-short:mb-1'

export const AUTH_FIELD_ICON =
  'absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none transition-all duration-200 group-focus-within:text-brand-600 group-focus-within:scale-110'

/* Appended to INPUT. `text-base` on phones is deliberate: below 16px iOS
   zooms the page when the field takes focus. */
export const AUTH_INPUT = 'py-3 pl-10 pr-11 text-base sm:text-sm auth-short:py-2'

export const AUTH_SUBMIT = `group relative w-full overflow-hidden py-3.5 rounded-xl text-white font-bold text-sm transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-brand-700/20 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-brand-700/30 active:translate-y-0 active:scale-[0.98] auth-short:py-2.5 ${brandConfig.accent} ${brandConfig.accentHover} disabled:cursor-not-allowed disabled:bg-slate-400 disabled:shadow-none disabled:hover:translate-y-0`

/** Icon tile that heads a card: gives the screen a face of its own. */
export function AuthBadge({ children }: { children: ReactNode }) {
  return (
    <span className="auth-badge mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 ring-1 ring-brand-100 ring-inset auth-short:hidden">
      {children}
    </span>
  )
}

/** Light that sweeps across the submit button on hover. */
export function SubmitSheen() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -translate-x-full bg-[linear-gradient(105deg,transparent_40%,rgba(255,255,255,0.28)_50%,transparent_60%)] transition-transform duration-700 group-hover:translate-x-full group-disabled:hidden"
    />
  )
}

/** Position in the staggered entrance of the form (see `.login-enter`). */
export function enterStep(index: number) {
  return { '--i': index } as CSSProperties
}
