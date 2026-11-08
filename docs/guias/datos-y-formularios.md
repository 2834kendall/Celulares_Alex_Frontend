# Datos y formularios

## Leer y escribir

- **Leer en Server Components.** La página llama a las acciones de lectura del módulo, que usan
  el cliente de sesión (`lib/supabase/server.ts`, RLS activa). Lecturas independientes en
  `Promise.all`.
- **Escribir con Server Actions + `revalidatePath`.** Sin `router.refresh()` después de una
  acción que revalida. Ver [rendimiento](../arquitectura/rendimiento.md).
- No hay librería de estado del lado del cliente.

## Validación: Zod + React Hook Form

1. **Los schemas viven en el `types.ts` del módulo**, nunca dentro de un componente.
2. **El tipo del formulario se infiere del schema** (`z.infer<typeof schema>`), no se escribe a
   mano.
3. Los schemas de `Insert`/`Update` se tipan contra los tipos generados de Supabase
   (`z.Schema<Database['public']['Tables'][…]['Insert']>`), para que un cambio de esquema rompa
   el build.
4. **Doble validación:** el mismo schema va en el cliente (resolver de RHF, para el feedback) y
   en el servidor (`safeParse` dentro de la Server Action, **antes** de tocar permisos o la
   base).

**Trampas conocidas:**

- **Zod no valida que una fecha exista** (`2026-02-30` pasa la regex). La única capa que lo
  comprueba es `parseShortDate`. Ver [components/ui](../../srgh-app/src/components/ui/README.md).
- **`setValueAs` sobre selects numéricos opcionales**: `Number(null) === 0` rompe un
  `.positive()`. Ver [users](../../srgh-app/src/modules/users/README.md).
- **Los `defaultValues` los pone quien llama, no el schema.** Un test que monta el formulario
  aislado con un fixture completo puede pasar mientras la pantalla real no precarga el campo.

## Proteger cambios sin guardar (SGRH-104)

Toda pantalla que edita datos pregunta antes de abandonar cambios sin guardar. "Seguir
editando" es la acción principal y tiene el foco; Escape o un clic en el fondo siguen editando.
Un formulario limpio, o con los cambios revertidos, no pregunta.

| pieza | para qué |
|---|---|
| `UnsavedChangesProvider` | en el layout raíz; registra formularios (etiquetas, lectores de estado, raíces del DOM), no copias de los datos |
| `useProtectedForm` | adaptador para RHF: `unsavedLabel`, valores/archivos/estado externos, `guard.bindRoot`, `guard.confirmLeave`, `guard.acceptChanges`. Su `reset` fija una base limpia nueva |
| `useUnsavedChanges` | editores con estado local, con soporte para "archivo pendiente" |
| `useConfirmLeave` | cambios de estado que desmontan un formulario (CRUD en línea, tabs) |
| `Modal` | X, Escape y fondo solo deciden sobre los formularios de **su** panel |
| `nextjs-nav-guard` (fijo en 1.1.3) | links, navegación imperativa y Atrás/Adelante del navegador |

**Reglas:**

- **Un guardado que falla mantiene el aviso**; uno exitoso acepta la base nueva **antes** de
  navegar o llamar al callback de éxito.
- Un guardado en curso no se cancela desde el diálogo: se pide esperar.
- `beforeunload` nativo mientras haya cambios. Recargar está excluido, porque las mutaciones lo
  usan para refrescar datos.
- **Al agregar un formulario nuevo de edición, hay que sumarlo a la protección.** No la usan los
  filtros y búsquedas, la autenticación, las listas de solo lectura ni la marca del kiosco.
- No se guardan datos de RRHH, contraseñas, archivos ni biometría en local/sessionStorage.

**Límites:** el diálogo nativo de recargar o cerrar la pestaña lo controla el navegador, y en
móvil cerrar la app desde el selector puede saltarse `beforeunload`. **No hay recuperación de
borradores.** Next 16.2 tiene un problema con `replace` asíncrono de solo query: el reemplazo
del colaborador confirma primero y llama a `replace` después.
