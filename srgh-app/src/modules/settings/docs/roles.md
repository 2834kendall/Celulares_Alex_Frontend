# Roles y permisos (SGRH-108)

Configuración → Roles y permisos (`/settings/roles`): crear, editar y eliminar roles. Código
en `modules/settings/roles/`. Pide `ROLES_WRITE`.

## Modelo: cada empresa tiene sus roles

| fila de `sgrh_cat_roles`          | qué es                                                              | se edita            |
| --------------------------------- | ------------------------------------------------------------------- | ------------------- |
| `rol_empresa_id` = X              | rol de la empresa X: copia de una plantilla o creado en la pantalla | sí, solo desde X    |
| `rol_empresa_id` NULL             | **plantilla** del sistema                                           | no, y no se muestra |
| plantilla con `ASISTENCIA_KIOSCO` | el rol del kiosco: se asigna tal cual                               | no (solo lectura)   |

- **Un rol vale para toda la empresa; no se ata a una sucursal.** Hasta dónde ve cada cuenta lo
  decide `uer_sucursal_id` (ver `supabase/docs/rls-y-alcance.md`). Es a propósito: las tiendas
  son chicas y el personal rota entre ellas, así que un rol por tienda solo agregaba pasos. Si
  dos tiendas necesitan permisos distintos, se crean dos roles y se asigna el que corresponda.
- **Las plantillas siembran empresas, no dan permisos a nadie.** Las define
  `supabase/seeds/01_sistema/` (`01_roles.sql`, `03_rol_permisos.sql`).
  `sgrh_private.instanciar_roles_empresa(<empresa>)` le da a la empresa una copia de cada
  plantilla activa y de las inactivas que ya usa, con los mismos permisos, y le pasa sus
  cuentas. Es re-ejecutable.
- La copia de la plantilla `P` se llama igual y tiene el código `EMPRESA_<empresa>_<P>`. Ese
  código es **identidad, nunca autorización**: nada en el código ni en las policies lo compara.
  Los permisos salen siempre de `sgrh_rol_permisos`.
- El hook del JWT no cambió: arma `permisos` por el `rol_codigo` del rol asignado. El menú y el
  perfil muestran el **nombre** (`lib/empresa/get-rol-nombre.ts`); el código no es un texto.

## Reglas (las decide la base)

Escribir pasa solo por las RPC `sgrh_save_role` y `sgrh_delete_role`. Son `SECURITY INVOKER`,
solo para `service_role`, y revalidan `ROLES_WRITE` **en vivo** (el JWT puede tener hasta una
hora). `authenticated` no tiene `INSERT/UPDATE/DELETE` sobre las tablas. `roles/access.ts`
hace la misma revalidación antes de leer con el cliente admin.

- **Solo roles de la empresa del JWT.** Una plantilla o un rol de otra empresa → «Rol no
  encontrado».
- **Nadie reparte lo que no tiene**: no se agrega a un rol un permiso que el propio rol no
  tiene. Lo que el rol ya traía se puede conservar o quitar. `MI_HORARIO_READ` es la
  excepción: no amplía ninguna policy.
- **No dejarse afuera**: nadie le quita `ROLES_WRITE` a su propio rol.
- **Dependencias**: escribir o aprobar exige ver. `REQUISITOS` en `roles/permissions.ts` es
  espejo de `sgrh_private.permiso_requisitos()`, y `permissions.test.ts` compara los dos.
- `ASISTENCIA_KIOSCO` no se asigna a ningún rol.
- **Eliminar**: con usuarios activos se bloquea. Si tuvo cuentas en el pasado, se archiva
  (`rol_activo = false`) en vez de borrarse.
- El trigger `uer_rol_empresa` vale para **cualquier** camino de asignación (invitar, editar,
  scripts). Rechaza roles de otra empresa o archivados, y una plantilla cuando la empresa ya
  tiene su copia.

## Trampas

- **Una empresa nueva no tiene roles hasta que se instancia.** Hoy las empresas se crean por
  SQL (seed de demo, fixtures de E2E): después de asignar las cuentas, llamar a
  `instanciar_roles_empresa`. Sin eso, el selector de rol de Usuarios queda vacío.
- **Volver a instanciar revive una copia eliminada.** La función reconoce la copia por su
  código: si la empresa eliminó su «Gerente» y se la vuelve a llamar, lo crea otra vez.
- **Cambiar una plantilla no cambia a nadie.** Un permiso nuevo tampoco llega solo a los roles
  existentes. La migración que lo reparta tiene que elegir los roles **por permiso** («todo rol
  con X recibe Y»), nunca por código: los códigos de las copias son generados y las empresas
  pueden haber renombrado o rearmado sus roles.
- **Un cambio de permisos llega con el siguiente token.** Quien tiene sesión lo ve cuando se
  renueva, dentro de la hora, o al volver a entrar.
- **Las columnas `rol_sucursal_id` y `rol_base_id` ya no existen.** Las dos primeras
  migraciones de roles las crean y la quinta (`…_roles_sin_sucursal.sql`) las quita; un rol
  que estuviera atado a una sucursal queda como un rol común, con sus cuentas y sus permisos.
- **Los tests de las acciones mockean la base.** Lo que de verdad protege está en SQL y lo
  prueba `roles/migration.test.ts` con PGlite, sobre las cinco migraciones de roles en orden.
