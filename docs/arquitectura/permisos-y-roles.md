# Permisos y roles

## El modelo

Las policies **no comparan nombres de rol**. Preguntan por permisos:
`tiene_permiso('NOMINA_WRITE')`. Los roles son solo un agrupamiento de permisos guardado en
tablas, así que agregar o cambiar un rol no exige tocar ninguna policy.

| tabla | contiene |
|---|---|
| `sgrh_cat_permisos` | el catálogo de permisos |
| `sgrh_cat_roles` | los roles (`rol_activo` dice si se pueden asignar) |
| `sgrh_rol_permisos` | la matriz rol → permiso |
| `sgrh_usuarios_empresa_rol` | qué rol tiene cada usuario en cada empresa, y en qué sucursal |

Todo eso se siembra en `supabase/seeds/01_sistema/` (es configuración, no datos de demo) con el
helper `sgrh_private.asignar_permisos`, que es convergente.

`tiene_permiso()` lee el array `permisos` del JWT en memoria: cero consultas por fila evaluada
(antes eran dos JOINs). Ver [auth y JWT](auth-y-jwt.md).

**Una condición se comprueba con permisos o con datos, nunca con el código de un rol.** Los roles se
van a poder crear, modificar y eliminar; lo fijo son los permisos. Tampoco vale razonar "ese rol no
tiene ese permiso". Quedan comparaciones con `KIOSCO` por resolver antes de permitir editar ese rol.

## Roles

| rol | `uer_sucursal_id` | ve |
|---|---|---|
| `ADMIN` | `NULL` | toda su empresa |
| `GERENTE` | con valor | solo su sucursal (tablas operativas) |
| `EMPLEADO` | — | solo lo suyo. **Cero permisos, a propósito** |
| `KIOSCO` | con valor | solo los empleados activos de su sucursal, y solo para marcar |

- **El alcance lo decide `uer_sucursal_id`, no el rol.**
- Hay 8 roles más sembrados con su matriz (RRHH, SUPERVISOR, CONTADOR…) pero inactivos.
  **Activar uno es un `UPDATE`**: ninguna regla puede asumir que no existen.
- `SUPERADMIN` se eliminó, y `EMPLEADO` no tiene permisos a propósito. El porqué está en
  [RLS y alcance](../../srgh-app/supabase/docs/rls-y-alcance.md).

## Del lado de Next

- **`lib/permissions/catalog.ts` es la única fuente de strings de permiso** en el código.
  Refleja la base, no al revés.
- `requirePermission(PERMISOS.X)` en cada página y cada Server Action; `usePermisos()` solo
  para mostrar u ocultar UI ([capas de seguridad](capas-de-seguridad.md)).
- `lib/permissions/zones.ts` es la fuente única de las **zonas** de la app: qué ruta existe,
  cómo se llama, en qué grupo del menú va y qué permisos dan acceso. La usan el menú lateral y
  los guards de las páginas (`requirePermission` / `requireAnyPermission`).

## Agregar un permiso

1. **Nace en la base**: una migración o seed que lo agregue a `sgrh_cat_permisos` y lo asigne
   a los roles que corresponda (convergente, por código, nunca por id).
2. Agregarlo a `lib/permissions/catalog.ts`.
3. Usarlo en las policies de su tabla, en el guard y en la UI.
4. **Quien ya tiene sesión no lo ve hasta volver a entrar**: el token se emite con los permisos
   del momento.

Un permiso que no aparece en ninguna policy ni en ningún guard no hace nada: no hay que
ofrecerlo en una pantalla de gestión de roles.

## Trampas

- **Darle un permiso a `EMPLEADO` le abre los datos de toda la empresa**: las ramas de "es lo
  mío" no dependen de permisos, las de permiso sí ven a todos.
- **Una policy con `OR tiene_permiso('X')` sin chequeo de empresa** es un hueco entre empresas.
  Ya pasó tres veces.
- **Los seeds solo agregan**: quitar un permiso de un rol en el seed no lo revoca en una base
  que ya lo tenía. Hay que revocarlo a mano.
- **No hay alcance "solo lo mío" por permiso.** Todo permiso de lectura es de toda la empresa,
  acotado solo por la sucursal del usuario. "Un supervisor que ve solo a su equipo" no se arma
  con permisos.

## Pendiente: permisos que no hacen lo que dicen

Inventario del 2026-10-09, re-verificado el 2026-11-07. Son 30 permisos; estos no gatean lo
que su nombre promete, y **no pueden ofrecerse en una pantalla de roles** hasta resolverlos:

| prioridad | permiso | problema |
|---|---|---|
| **P0** | `NOMINA_APPROVE` | 0 usos en RLS y en guards. Todas las acciones de pago piden `NOMINA_WRITE`: **quien calcula la planilla es quien la marca pagada**, y no hay separación de funciones |
| **P0** | `AUSENCIAS_WRITE` | no gatea nada. Para *registrar* una ausencia hay que tener `AUSENCIAS_APPROVE`. **Decisión de negocio pendiente:** cablearlo (habilita "solicitar sin aprobar", el autoservicio de vacaciones) o borrarlo y dejar dos niveles, Ver y Aprobar |
| **P0** | `HISTORIAL_READ` | hoy no separa nada: la policy de `sgrh_historial_laboral` lo acepta como alternativa de otro permiso, así que no distingue "ver expedientes" de "ver contratos y salarios". Detalle y arreglo propuesto, en el ticket correspondiente |
| P1 | `REPORTES_READ` | sin módulo y sin uso: borrarlo o marcarlo reservado |
| P1 | `COMPROBANTES_READ` | placeholder a propósito (`payroll/page.tsx` muestra "Disponible próximamente") |
| P1 | `ROLES_WRITE` | nunca es *requerido*: siempre aparece como alternativa de `USUARIOS_WRITE` |
| P2 | `CATALOGOS_WRITE` | un solo interruptor para seis catálogos de dueños distintos (puestos, tardías, **conceptos de nómina**, rubros, etapas y criterios, tipos de turno). Partirlo por módulo merece ticket propio; mientras tanto, la UI tiene que enumerar los seis |
| P2 | — | no hay forma de ver Configuración sin poder cambiarla (`/settings` exige uno de cuatro permisos `WRITE`). Un `CONFIGURACION_READ` habilitaría un rol auditor |

Las tres P0 tocan los mismos archivos (`20260101000600_rls_policies.sql` y los guards) y pueden
ir en una sola migración.
