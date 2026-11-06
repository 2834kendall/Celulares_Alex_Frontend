# SGRH system branding

`SystemLogo` renders the blue/cyan symbol without a wordmark on the shared public authentication shell (login, password recovery, reset, activation and public status screens).

The dashboard and company identity header retain their existing presentation. The company logo remains configurable independently from the system symbol.

## Browser and link previews

- `src/app/favicon.ico`: system symbol at 16, 32 and 48 px.
- `public/brand/sgrh-apple-icon.png`: 180 × 180 Apple touch icon.
- `public/brand/sgrh-social.png`: 1200 × 630 Open Graph and Twitter preview.
- `public/brand/sgrh-isotipo-v1.png`: transparent source symbol used by `SystemLogo`.

The root layout defines Spanish titles, description and social metadata. Set `NEXT_PUBLIC_SITE_URL` to the canonical public origin when using a custom domain. Without it, metadata uses `https://celulares-alex-frontend.vercel.app`. Restart or rebuild after changing the variable. Social previews require publicly reachable deployed images; localhost changes are not visible to external link crawlers.
