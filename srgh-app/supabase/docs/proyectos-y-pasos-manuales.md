# Proyectos de Supabase y pasos manuales

## Hay DOS proyectos, y confundirlos es el peor error posible del repo

| ref                    | qué es                                               |
| ---------------------- | ---------------------------------------------------- |
| `paupjapsxvufinozlhss` | **dev**. El que se usa todo el tiempo                |
| `opgdvnkbdledcyvpeifu` | **producción**. Se toca muy poco y va muy por detrás |

- **Son cuentas de Supabase distintas** (organizaciones y dueños diferentes). Todo lo que se
  configura a mano en una hay que repetirlo en la otra.
- **Los tipos "stale" (sin `sgrh_cat_bancos`) que aparecieron alguna vez no eran un ref viejo
  mal puesto**: eran los tipos reales de producción, que está atrasada.
- **Hay dos punteros distintos, y hay que mover los dos:**
  - el CLI usa el proyecto **vinculado** (`--linked`, `supabase/.temp/`);
  - `scripts/encrypt-payment-data.ts` usa **`.env.local`** (`NEXT_PUBLIC_SUPABASE_URL` +
    `SUPABASE_SECRET_KEY`).

  Apuntar uno a producción y olvidar el otro es la forma de escribir en la base equivocada.
  Después de cualquier operación contra producción, **volvé a vincular dev, restaurá
  `.env.local` y verificalo** antes de seguir.

- Los scripts de `package.json` usan `--linked`, para que el ref no esté fijo en el código.
  La excepción es `supabase:link`, que vincula a dev a propósito (para producción se vincula a
  mano). **Cualquier otro `--project-id` o `--project-ref` fijo es un bug.**

## Pasos manuales que NO viajan en las migraciones

Son configuración del proyecto, no del esquema. Si se olvidan, las migraciones corren perfecto
y la app igual queda muerta. En `config.toml` están declarados, pero eso solo aplica al
entorno local.

1. **Hook de JWT**: Dashboard → Authentication → Hooks → Customize Access Token →
   `public.custom_access_token_hook`. Sin esto, el JWT sale sin claims, `tiene_permiso()`
   devuelve `false` para todo y la RLS bloquea absolutamente todo.
2. **Plantilla Invite**: Authentication → Email Templates → Invite user, con el contenido de
   `supabase/templates/invite.html`.
3. **Plantilla Reset Password**: Authentication → Email Templates → Reset Password, con
   `supabase/templates/reset-password.html`. Sin esto, el correo sale con el
   `{{ .ConfirmationURL }}` de fábrica y la recuperación muere en el fragmento de la URL (ver
   [auth](../../src/modules/auth/README.md)).

## Política de Auth (SGRH-99)

En Authentication → Providers → Email, y en Policies. No rompe la app si falta, pero deja
abierta la cadena de toma de cuenta:

4. **Contraseñas**: mínimo **12** caracteres, con minúsculas, mayúsculas, dígitos **y**
   símbolos. **Es espejo de `PASSWORD_RULES`** (`src/modules/auth/types.ts`): se cambian las
   dos juntas o ninguna.
5. **Secure password change** + **Require current password when updating**: activados. El
   segundo es el que cierra la cadena: una sesión robada no puede cambiar la contraseña sin
   saber la anterior. No afecta la recuperación, porque el enlace del correo ya prueba la
   identidad.
6. **Allow new users to sign up**: **apagado**. Los usuarios se crean por invitación
   (`inviteUser.ts`, API admin), que no pasa por el registro público.

**Sin plan Pro no se puede activar:** la protección contra contraseñas filtradas
(HaveIBeenPwned), el timeout de inactividad, el timebox de sesión ni la sesión única. Los
timeouts, además, chocan con la sesión permanente de la tablet del kiosco.

> **Estado:** los pasos 4 a 6 se aplicaron en un solo proyecto el 2026-10-15. Falta repetirlos
> en el otro.
