# Contratos

Tab **Contrato** del perfil del empleado: crear, editar, terminar y revertir. Las reglas viven
en las RPC (`SECURITY INVOKER`, con `HISTORIAL_WRITE`), no en la UI. La pantalla solo las
anticipa.

## Reglas de negocio

- **Un solo contrato vigente por empleado.** Vigente = `lab_fecha_fin IS NULL`. Lo garantiza
  el índice `ux_historial_un_contrato_vigente`.
- **El contrato vigente se edita siempre**, haya pasado por planilla o no. Se corrigen el
  puesto, la sucursal base, el tipo, la jornada y los dos salarios.
- **Cuándo aplica el cambio:**
  - Las quincenas que ya tienen filas **conservan sus montos**: cada fila guarda la foto del
    contrato con que se calculó ([foto del contrato](../../payroll/docs/foto-del-contrato.md)).
  - Los períodos que se creen después **toman el contrato nuevo**.
  - **Excepción:** si se **recalcula** un período todavía sin pagar (subir el Excel, "traer
    horas", editar la fila, "recalcular todo"), ese período **adopta el contrato nuevo** y
    reescribe la foto. Es la forma de corregir un salario mal digitado antes de pagarlo. El
    modal de editar se lo avisa al usuario.
- **Qué no se edita:**
  - **La fecha de inicio, nunca**: moverla dejaría marcas, turnos y el contrato anterior
    apuntando a un período que ya no existe. Se valida solo al crear.
  - **Un contrato con terminación registrada**: primero hay que revertirla. Si no, la
    liquidación quedaría calculada sobre otras condiciones.
  - **La sucursal base, mientras haya una quincena sin pagar** (ver abajo). No se destraba
    con el tiempo, solo pagando.
- **Crear un contrato exige que el anterior esté liquidado**: `contratosDeLaRelacion`
  (`payroll/lib/derechos.ts`) corta la relación laboral solo en contratos liquidados.

## Sucursal base vs. dónde trabaja

| columna           | significa                                                              | quién la mueve                                         |
| ----------------- | ---------------------------------------------------------------------- | ------------------------------------------------------ |
| `lab_sucursal_id` | **sucursal base**: en qué planilla se le paga y quién ve su expediente | RRHH, con `editar_contrato`                            |
| `prg_sucursal_id` | dónde trabaja **ese día**                                              | el gerente, celda por celda en la programación semanal |

Las horas cubiertas en otra tienda ya se pagan en la planilla del contrato
(`20261002120000_asistencia_nomina_otras_sucursales.sql`). Por eso cambiar la base **no**
traslada a nadie ni reescribe la historia: marcas, turnos, períodos y evaluaciones llevan su
propia sucursal.

Lo único que bloquea el cambio de base es una **quincena sin pagar**. Un período elige a su
gente por `lab_sucursal_id`: mover la base a medio pagar dejaría la fila en la planilla vieja
mientras la nueva la vuelve a crear, y la quincena quedaría con dos filas. El guard es
`sgrh_private.tiene_quincena_sin_pagar()`, `SECURITY DEFINER` a propósito: un `EXISTS` bajo
RLS no vería filas si quien edita no tiene `NOMINA_READ`, y el guard fallaría abierto.

## Flujo de salida

1. **RRHH termina el contrato** desde el perfil (`terminar_contrato`): fecha y motivo.
   - Último día **hoy o futuro** (preaviso): no toca `lab_fecha_fin`, se guarda en
     `lab_fecha_fin_programada`. El job `cerrar-contratos-programados` (pg_cron, 00:05 CR,
     `seeds/01_sistema/05_jobs.sql`) lo cierra al día siguiente. La regla de vigencia está en
     ~15 consultas y 3 policies; por eso no se adelanta.
2. **Mientras no se liquide**, la terminación se puede revertir (`revertir_terminacion`).
3. **Contabilidad liquida** desde Planilla: ver [liquidación](../../payroll/docs/liquidacion.md).
   Después ya **no hay vuelta atrás**: `revertir_terminacion` rechaza un contrato liquidado.

## Datos

| RPC                    | qué hace                                                                                     | migración                                |
| ---------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `crear_contrato`       | contrato nuevo; valida fecha contra empresa, contrato anterior, primera marca y primer turno | `20260927120000_contratos_crud.sql`      |
| `editar_contrato`      | corrige el vigente (reglas de arriba)                                                        | `20261011120000_foto_salario_nomina.sql` |
| `terminar_contrato`    | registra la salida, con o sin preaviso                                                       | `20260927120000_contratos_crud.sql`      |
| `revertir_terminacion` | deshace una salida no liquidada                                                              | `20260927120000_contratos_crud.sql`      |

Acciones: `actions/createContract.ts`, `updateContract.ts`, `terminateContract.ts`,
`revertContractTermination.ts`.

## Trampas

- **Las RPC serializan por contrato con `pg_advisory_xact_lock`, no con `FOR UPDATE`.** Bajo
  RLS, `FOR UPDATE` exige la policy de UPDATE (`HISTORIAL_WRITE`), y quien liquida no la
  tiene.
- **No confundir con un traslado.** Un traslado real cierra la fila vigente y abre otra.
  Corregir la sucursal base es editar en sitio. Son dos operaciones distintas.
- **El `COMMENT ON TABLE` del baseline** todavía dice que `lab_sucursal_id` no se edita en
  sitio. Era cierto antes de SGRH-84; el `COMMENT ON COLUMN` vigente lo corrige.
