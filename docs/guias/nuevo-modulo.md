# Crear un módulo o agregar una funcionalidad

Un módulo nuevo sigue siempre el mismo patrón: no hay que inventar estructura. Estructura de
carpetas y regla de oro en [visión general](../arquitectura/vision-general.md).

## Módulo nuevo (ejemplo: `training`)

1. **Base de datos primero.** La tabla nace en una migración (skill `supabase-migracion`), con
   **RLS habilitada** y sus policies (aislamiento por empresa, INSERT/UPDATE/DELETE separados,
   `WITH CHECK`). Después, `pnpm supabase:types`.
2. **Permisos en la base.** Los permisos nuevos se siembran en `sgrh_cat_permisos` y se asignan
   a los roles, y recién después se agregan a `lib/permissions/catalog.ts`. Ver
   [permisos y roles](../arquitectura/permisos-y-roles.md).
3. **Carpeta del módulo**, en `src/modules/training/`:
   - `types.ts`: los schemas Zod y los tipos inferidos (el contrato de datos);
   - `actions/`: Server Actions, una operación de negocio por archivo;
   - `components/`: todo lo visual del dominio;
   - `hooks/`, `lib/`: si hacen falta;
   - `README.md`: con la plantilla de [`docs/README.md`](../README.md).
4. **Carga de datos:** la página (Server Component) llama a las acciones de lectura en
   `Promise.all`; los componentes cliente escriben con Server Actions que terminan en
   `revalidatePath`. Ver [datos y formularios](datos-y-formularios.md).
5. **Ruta** en `src/app/(dashboard)/training/page.tsx`, delgada: `requirePermission(...)`
   **antes** de cualquier carga, carga en paralelo y ensamblado del componente del módulo.
6. **Navegación:** la zona nueva va en `lib/permissions/zones.ts`, que alimenta el menú lateral
   y los guards. `usePermisos()` solo para mostrar u ocultar dentro de la página.
7. **Errores y cargas:** se heredan los de `app/(dashboard)/`. Un `loading.tsx` o `error.tsx`
   propio solo si el módulo lo justifica.

## Funcionalidad nueva en un módulo existente

Ejemplo: "exportar a Excel" en `payroll`.

- Una Server Action nueva en `modules/payroll/actions/`, con el
  [patrón de siempre](../arquitectura/capas-de-seguridad.md): `safeParse` →
  `requirePermission` → empresa del JWT → operación → `{ ok, … }`.
- **Un permiso nuevo siempre nace en Supabase, nunca en el frontend.** El catálogo del frontend
  refleja la base, no al revés.
- **Un catálogo configurable** (puestos, tipos de tardía, etapas…) vive en el módulo **dueño
  del dato**: acciones, componentes y schema en `modules/<dominio>/`. Configuración solo lo
  muestra (ver [settings](../../srgh-app/src/modules/settings/README.md)).
- Si cambia una regla del módulo, se actualiza su README en el mismo PR.

## Qué NO hacer

- Lógica de negocio en `app/**/page.tsx` más allá de obtener datos y ensamblar componentes.
- Un string de permiso escrito a mano fuera de `lib/permissions/catalog.ts`.
- Proteger una ruta solo con `usePermisos()`: siempre hace falta el guard del servidor.
- Editar `types/database.types.ts` a mano: se regenera con el CLI.
- Mezclar componentes de dos módulos en la misma carpeta "para no duplicar". Una duplicación
  chica entre módulos es preferible al acoplamiento cruzado.
- Leer un catálogo **por empresa** con el cliente admin dentro de `unstable_cache`: se salta la
  RLS de tenant (ver [rendimiento](../arquitectura/rendimiento.md)).
