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

- Cada **kiosco lógico** tiene un UUID que emite el servidor, **una sucursal**, un **usuario**
  y **una cuenta propia** con rol `KIOSCO`. Una sucursal puede tener varios kioscos, en
  cualquier teléfono, tablet o computadora.
- **No hace falta correo (SGRH-111).** El kiosco entra en `/login` con su usuario y la
  contraseña que definió el administrador.
  - El usuario va en `kio_login`: de 3 a 40 caracteres en minúsculas, **único en todo el
    sistema** (la pantalla de login no sabe de qué empresa es quien entra). La regla vive en
    `lib/kiosk/login.ts` y en el `CHECK` de la tabla: se cambian juntas.
  - Por dentro la cuenta de Auth sigue existiendo, con un correo interno
    `kiosk-<uuid>@kiosk.sgrh.internal` que nadie ve ni lee (`lib/kiosk/internalEmail.ts`).
    `.internal` es un dominio reservado: nunca llega a un tercero. Si un proyecto de Supabase
    lo rechazara, se cambia con la variable `KIOSK_EMAIL_DOMAIN` sin tocar código.
  - El login traduce un usuario sin `@` a ese correo con el cliente admin. Un usuario
    inexistente responde "Credenciales invalidas.", igual que una contraseña mala.
  - "Olvidé mi contraseña" ignora los correos internos: la contraseña de un kiosco la cambia el
    administrador.
- **Controla cuentas, no hardware**: con el usuario y la contraseña se abre el kiosco en
  cualquier navegador, también fuera de la tienda. El emparejamiento de dispositivos queda
  fuera.
- Una cuenta `KIOSCO` exige **exactamente una** asignación activa. Las marcas se atribuyen al
  id del kiosco del servidor, no a uno que mande el navegador.

## Ciclo de un kiosco

La tarjeta de cada kiosco (`KioskCard.tsx`) sigue el patrón de las marcas: arriba solo
información (usuario y última actividad), abajo **Editar**, **Contraseña** (o **Habilitar**
si está bloqueado) y un menú **⋯** con bloquear o cambiar de sucursal. Cada acción abre su
propio modal; la tarjeta nunca despliega formularios adentro.

1. **Registrar** pide nombre, usuario y contraseña. Guarda el kiosco, crea la cuenta de Auth
   ya confirmada (**sin correo**) y la vincula: queda habilitado de inmediato.
   - Si el kiosco se guardó pero la cuenta falló, queda **Sin acceso** y el error se muestra
     en pantalla. Se termina con **Definir contraseña**, sin registrarlo de nuevo.
2. **Contraseña** cierra la sesión del kiosco **en todos los aparatos**: borra sus
   sesiones de Auth y la validación en vivo (`sgrh_kiosk_context`) rechaza el token aunque
   todavía no haya vencido.
3. **Editar** cambia nombre y usuario en un solo modal; se puede siempre y no cierra sesiones.
4. **Moverlo de sucursal exige bloquearlo antes**, y queda bloqueado en la nueva hasta que
   alguien lo habilite.
5. **Bloquear, reasignar o cambiar la contraseña** sube la versión de acceso: los tickets
   faciales viejos dejan de valer.

- **Kioscos anteriores a SGRH-111**: siguen entrando con su correo real hasta que se les
  asigne un usuario desde **Editar**. Ya no hay invitaciones ni "Recuperar acceso".
- **Registrar siempre crea una cuenta nueva.** Ya no se ofrece adoptar una cuenta `KIOSCO`
  suelta: esas cuentas siguen entrando como antes, sin registro, hasta que se den de baja.
- Un kiosco registrado antes de SGRH-111 que quedó pendiente con su correo real sí recupera su
  cuenta al **Definir contraseña**: se **vincula primero** (la RPC la valida) y solo después
  recibe la contraseña nueva. No puede quedarse con una cuenta personal, vinculada a un
  empleado, de otro rol o de otra empresa.
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
| usuario del kiosco y cierre de sesiones  | `20261119222018_kiosk_username_login.sql`              |

Los tests corren el SQL real en un PostgreSQL desechable (`branches/migration.test.ts`).
