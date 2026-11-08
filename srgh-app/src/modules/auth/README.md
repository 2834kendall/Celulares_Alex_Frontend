# Autenticación (`auth`)

## Qué hace

Login y los **dos flujos que llegan por correo**: activar la cuenta (invitación, SGRH-59) y
recuperar la contraseña (SGRH-79). Los dos comparten toda la maquinaria.

Rutas: `/login`, `/forgot-password`, `/auth/confirm` (route handler), `/activate-account`,
`/reset-password`.

## Flujos

1. El correo trae un enlace a `/auth/confirm?token_hash=…&type=…`.
2. `/auth/confirm` canjea el `token_hash` por una sesión con `verifyOtp` y redirige al `next`
   (saneado contra open redirect).
3. En la pantalla destino se define la contraseña.

| flujo                                                                                            | `type`     | destino             |
| ------------------------------------------------------------------------------------------------ | ---------- | ------------------- |
| Activación                                                                                       | `invite`   | `/activate-account` |
| Recuperación: `/login` → "¿Olvidó su contraseña?" → `/forgot-password` (`resetPasswordForEmail`) | `recovery` | `/reset-password`   |

Compartido entre los dos: `SetPasswordForm` (la pantalla), `lib/updatePassword.ts` (la Server
Action) y `ExpiredLink` (enlace vencido; los textos de cada flujo están en `constants.ts`).
`setPasswordSchema` es la única regla de contraseñas; `activateAccountSchema` y
`resetPasswordSchema` son alias suyos.

## Reglas de negocio

- **Las plantillas de correo son configuración del proyecto Supabase y no viajan en el
  repo.** Tienen que apuntar a
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=…`. Pasos en
  [proyectos y pasos manuales](../../../supabase/docs/proyectos-y-pasos-manuales.md).
- **Política de contraseñas:** mínimo 12 caracteres, con minúsculas, mayúsculas, dígitos y
  símbolos. `PASSWORD_RULES` (`types.ts`) es espejo de la política del Dashboard: **se cambian
  juntas o ninguna**. Si difieren, la pantalla acepta lo que el servidor rechaza, o al revés.
- Los usuarios se crean **solo por invitación**. El registro público tiene que estar apagado.

## Trampas

- **`requestPasswordReset` es la ÚNICA Server Action sin `requirePermission`**: quien la llama
  no tiene sesión. Además **responde `{ ok: true }` ante cualquier error de la API, incluido
  un correo inexistente**: el formulario es público, y confirmar qué cuentas existen lo
  volvería un directorio de correos de la empresa. Solo se reportan el 429 y los fallos de
  red.
- **Nunca usar el enlace de fábrica de Supabase (`{{ .ConfirmationURL }}`).** Entrega la
  sesión en el _fragmento_ de la URL (`#access_token=…`), que el servidor nunca ve. Con
  `@supabase/ssr` (sesión en cookies) es un callejón sin salida. Siempre `token_hash` +
  `verifyOtp` en un route handler.
- **Cobertura 100 % obligatoria** en `modules/auth/**` y `lib/auth/**` (`vitest.config.ts`).
  Si tocás algo acá, corré `pnpm test:coverage` antes de darlo por cerrado.
