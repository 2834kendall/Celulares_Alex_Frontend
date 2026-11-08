# Git, Jira y calidad de código

Todo el contenido técnico (ramas, commits, títulos y descripciones de PR) va en **inglés**.
Los textos de UI y la documentación, en español.

## Ramas

`<type>/<JIRA-KEY>-<short-kebab-description>`, por ejemplo `feature/SGRH-59-users-module`.

| tipo | uso |
|---|---|
| `feature/` | funcionalidad nueva |
| `fix/` · `hotfix/` | corrección · corrección urgente de producción |
| `chore/` | herramientas, dependencias, configuración |
| `docs/` · `refactor/` · `test/` | solo docs · reestructurar sin cambiar comportamiento · solo tests |

- La clave de Jira va **exacta** (`SGRH-57`): así Jira vincula rama, commits y PR solo. Un typo
  en la rama pasa silencioso (Git no valida nada), pero Jira nunca la vincula.
- **Modelo real:** las ramas salen de **`dev`** y vuelven a `dev` por PR. `main` solo recibe PRs
  desde `dev` (lo exige `.github/workflows/restrict-main-to-dev.yml`). El estándar original
  decía `develop`: en este repo es `dev`.
- Varias ramas pueden usar la misma clave de Jira.

## Commits

```
SGRH-XX: <type>(<scope>): <resumen imperativo>

<cuerpo opcional: qué y por qué>
```

- Tipos: `feat`, `fix`, `refactor`, `style`, `chore`, `docs`, `test`, `perf`.
- **commitlint los valida** (`srgh-app/commitlint.config.js`): el prefijo es literalmente
  `SGRH-\d+` (un `SRGH-73` se rechaza), el scope admite letras, `.`, `-`, `$`, `*` y espacios
  (**no comas**), y **ninguna línea del cuerpo puede pasar de 100 caracteres**.
- Resumen ≤ 72 caracteres, en imperativo ("add", no "added"). Un cambio lógico por commit.

## Pull requests

- Título: `SGRH-XX: <título del issue de Jira, en inglés>`.
- Descripción con `## Jira` (enlace a `https://herreraharold132.atlassian.net/browse/SGRH-XX`),
  `## Summary`, `## Changes`, `## How to test` y `## Checklist`.
- Squash and merge a `dev`, al menos 1 aprobación, borrar la rama después.
- **Antes de abrir el PR, `pnpm test` completo** (los hooks no lo corren).

## Hooks (en `srgh-app/.husky/`)

| hook | corre | no corre |
|---|---|---|
| `commit-msg` | commitlint | — |
| `pre-commit` | `lint-staged`: Prettier + ESLint sobre lo staged (`.lintstagedrc`) | **ningún test** (con vitest ahí, un commit tardaba 16 a 40 s) |
| `pre-push` | `tsc --noEmit` + `vitest related` sobre lo que se pushea | la suite completa: un cambio que solo toca SQL o `.md` no ejecuta un test |

## Formato y lint

- **Prettier** (`.prettierrc`: comillas simples, sin punto y coma) y **ESLint**
  (`eslint.config.mjs`, con `eslint-config-prettier`). `pnpm lint` tiene 7 warnings
  preexistentes y 0 errores.
- **`pnpm format:check` está rojo en Windows siempre, y no significa que haya código sin
  formatear.** `core.autocrlf=true` deja CRLF en el working tree, `.prettierrc` no define
  `endOfLine`, y Prettier 3 asume `lf`. Lo commiteado está bien (`srgh-app/.gitattributes`
  normaliza a LF).
  - **Para medir de verdad** si un archivo está mal formateado, descontá el `\r`:
    `npx prettier <f> | diff <(tr -d '\r' < <f>) -`. Diff vacío = solo fin de línea.
  - Medilo dentro de `srgh-app/`: fuera de ahí Prettier no encuentra el `.prettierrc` y usa sus
    defaults.
  - La salida real es una línea en `.prettierrc`: `"endOfLine": "auto"`.
- **Prettier en Markdown:** una línea que empieza con `+` o `-` se convierte en viñeta. Al
  cortar una frase, que la línea siguiente no empiece con un signo.

Testing: ver [testing](testing.md).
