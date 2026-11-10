# Sucursales y kioscos (SGRH-103)

Configuración → Sucursales (`/settings/branches`): identidad, contacto, dirección,
coordenadas informativas y cuentas de acceso de los kioscos de cada sucursal. Código en
`modules/settings/branches/`.

## Permisos

- **Sucursal:** `EMPRESAS_WRITE`.
- **Cuentas de kiosco:** además, `USUARIOS_WRITE`.
- Las RPC (`sgrh_save_branch`, `sgrh_manage_kiosk`, `sgrh_assert_branch_admin`) son
  `SECURITY INVOKER` y revalidan en vivo la identidad, la empresa y los permisos de quien
  administra. Las tablas nuevas (`sgrh_kioscos`, `sgrh_config_auditoria`) tienen RLS y ningún
  acceso para `anon` ni `authenticated`.

## Modelo de acceso

- Cada **kiosco lógico** tiene un UUID que emite el servidor, **una sucursal**, un correo
  técnico único y **una cuenta propia** con rol `KIOSCO`. Una sucursal puede tener varios
  kioscos, en cualquier teléfono, tablet o computadora.
- Alcanza con un alias corporativo que de verdad reciba correo; no hace falta un buzón por
  terminal. El correo de contacto de la sucursal **no** es una cuenta.
- **Controla cuentas, no hardware**: unas credenciales copiadas abren otro navegador. El
  emparejamiento de dispositivos queda fuera.
- Una cuenta `KIOSCO` exige **exactamente una** asignación activa. Las marcas se atribuyen al
  id del kiosco del servidor, no a uno que mande el navegador.

## Ciclo de un kiosco

1. **Guardar** crea un registro pendiente; **no manda correo**.
2. **Enviar invitación** crea la identidad en Auth y vincula el usuario con la asignación
   `KIOSCO`.
3. Si la invitación salió pero el vínculo falló, **Completar vínculo** termina el mismo
   registro.
   - No puede quedarse con una cuenta personal, vinculada a un empleado, de otro rol o de otra
     empresa.
   - Si la invitación quedó a medias: Usuarios → reenviar, y después Completar vínculo acá.
4. **Renombrar** se puede siempre. **Moverlo de sucursal exige bloquearlo antes**, y queda
   bloqueado en la nueva hasta que alguien lo habilite.
5. **Bloquear o reasignar** sube la versión de acceso: los tickets faciales viejos dejan de
   valer.

- **Recuperar acceso** manda el correo de recuperación de siempre. En pantalla **no hay botón
  de reenviar la invitación** (se quitó en el PR #73). El modo `reenviar` sigue en
  `provisionKiosk`, sin ningún llamador en la UI, y exige que el usuario nunca haya iniciado
  sesión.
- Las cuentas `KIOSCO` que ya existían se ofrecen en "Usar una cuenta KIOSCO existente", para
  vincularlas **a mano**. La migración no registró ni reasignó nada sola. Hasta que se
  vinculan, conservan su configuración anterior.
- Un trigger diferido y privado (`SECURITY DEFINER`, no expuesto) rechaza al commit los
  cambios directos de asignación o de vínculo que rompan estas reglas.
- La auditoría guarda quién, qué acción, sobre qué entidad y cuándo. Nunca copia datos
  biométricos, credenciales ni datos personales.

## Ciclo de una sucursal

- **Toda sucursal pertenece a una marca** de su empresa ([marcas](marcas.md)). El formulario la
  exige, y llega preseleccionada si se viene filtrando por una marca o si hay una sola activa. El
  listado se agrupa por marca, y su filtro de marca vive en la URL (`?marca=<id>`).
- **Guardar es transaccional.** La dirección se edita con copy-on-write: no modifica una
  dirección vieja que comparta otra entidad.
- El código interno se valida sin distinguir mayúsculas, bajo un advisory lock por empresa.
  Los duplicados viejos no se reescriben ni se borran.
- **Desactivar se rechaza** si hay contratos vigentes, horarios actuales o futuros, jornadas
  recientes sin cerrar o kioscos registrados sin bloquear. Nunca mueve gente ni borra
  historia de asistencia o planilla.
- La tolerancia por sucursal se retiró y no vuelve: las tardías siguen en el catálogo de
  tipos de tardía.

## Marcas pendientes del navegador

`/settings/branches/pending` muestra los borradores pendientes de **este navegador** para la
empresa actual, sin reenviarlos ni borrarlos. **Desde el PR #73 ningún menú enlaza a esta
página**: se llega solo por la URL. Es una ayuda para conciliar, **no una prueba de
asistencia**: antes de corregir algo a mano, mirá el historial del servidor. Los tickets
viejos sin contexto se cuentan, pero se muestran ocultos. Cómo se encolan y se rechazan esas
marcas: ver el módulo de asistencia.

## Datos

|                                          | migración                                              |
| ---------------------------------------- | ------------------------------------------------------ |
| sucursales, kioscos, auditoría, RPC      | `20261106185915_branch_kiosk_settings.sql`             |
| protección de las asignaciones de kiosco | `20261106193801_protect_managed_kiosk_assignments.sql` |
| marca de la sucursal (`suc_marca_id`)    | `20261107153512_marcas_comerciales.sql`                |

Los tests corren el SQL real en un PostgreSQL desechable (`branches/migration.test.ts`).
