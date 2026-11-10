# Componentes compartidos (`components/ui`)

## Qué hace

Piezas de interfaz que usa todo el repo. Un cambio de contrato acá rompe lejos.

**Antes de escribir un componente nuevo, revisá si ya existe:** `<Avatar/>` (foto de
empleado), `ImageUploadModal` + `PhotoDropzone` (foto de empleado y logo de empresa),
`<Alert tone="…">`, `ConfirmDialog`, `ColorPicker` (reemplazó al `<input type="color">`
nativo), `Tabs`, `Skeleton`, `PageHeader`, `ProfileSection`, `SystemLogo`.

## `DateField` es un `<input>` escribible, no un botón (SGRH-97)

`DateField`, `DatePopover` y `DatePickerButton` viven los tres en `DatePickerButton.tsx`
(`ControlledDateField.tsx` es el adaptador para React Hook Form).

- El valor que entra y sale sigue siendo la cadena ISO `YYYY-MM-DD`; cambió el disparador.
  `DatePopover` es genérico (`<E extends HTMLElement>`) para que el disparador pueda ser un
  `input` o un `button`.
- `DatePickerButton` (el ícono para navegar por día en un listado) y el disparador propio de
  Horarios **siguen siendo botones a propósito**: son navegadores, no campos.
- **En los tests:**
  - se busca con `getByRole('combobox', { name })` y se verifica con
    `toHaveValue('15/08/2026')` (`getByRole('button')` + `toHaveTextContent` ya no aplican);
  - para poner una fecha se teclean los ocho dígitos (`'15082026'`);
  - **si el campo viene precargado, primero `user.clear()`**: la máscara corta en 8 dígitos,
    así que teclear encima no cambia nada.

## Ningún schema de Zod valida que una fecha EXISTA

Los ~15 campos de fecha usan `z.string().regex(/^\d{4}-\d{2}-\d{2}$/)`, que acepta
`2026-02-30` y `2026-13-01`. Desde que la fecha se puede escribir, **la única capa que lo
comprueba es `parseShortDate`** (`lib/time/shortDate.ts`), con el ida y vuelta por `Date`.

`isValidISODate` (`modules/attendance/lib/time.ts`) tampoco sirve: solo mira el formato, y
`new Date('2026-02-30T00:00:00')` no es inválida, rueda al 2 de marzo. Si una fecha entra por
otra vía (import, API, pegada en un campo nuevo), hay que validarla ahí.

## Marca del sistema

- **`SystemLogo`** muestra el símbolo azul/cian sin nombre en las pantallas públicas de
  autenticación (login, recuperación, activación, estado). El dashboard y el encabezado de la
  empresa mantienen su presentación. El logo de la empresa se configura aparte (ver
  [settings](../../modules/settings/README.md)).
- Íconos y vistas previas:
  - `src/app/favicon.ico`: 16, 32 y 48 px;
  - `public/brand/sgrh-apple-icon.png`: 180 × 180;
  - `public/brand/sgrh-social.png`: 1200 × 630, Open Graph y Twitter;
  - `public/brand/sgrh-isotipo-v1.png`: el símbolo fuente, transparente.
- El layout raíz define títulos, descripción y metadatos sociales en español. Con dominio
  propio, definí **`NEXT_PUBLIC_SITE_URL`** y reconstruí. Sin esa variable se usa
  `https://celulares-alex-frontend.vercel.app`. Las vistas previas sociales solo se ven con
  imágenes publicadas: un cambio en localhost no lo ven los crawlers.

## Trampas de lint (`react-hooks/refs`, React Compiler, a11y)

- **Con `useController`**, acceder a `field.onBlur`, `field.ref`, etc. directo en el JSX da
  un falso positivo. Solución: destructurar
  (`const { value, onChange, onBlur, name, ref } = field`).
- **"Cannot access refs during render"** es real con un _callback ref_ pasado a un
  disparador, o al leer `algo.current` durante el render. Las dos salidas usadas acá:
  - hacer el componente genérico sobre el tipo del elemento y pasar un `RefObject`, no un
    callback;
  - convertir el ref en `useState` cuando su valor participa del render.
- **`jsx-a11y/role-has-required-aria-props`** no ve `aria-expanded` ni `aria-controls` si
  llegan dentro de un spread: hay que destructurarlos y pasarlos explícitos.
