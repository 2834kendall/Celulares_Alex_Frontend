# Expedientes (`employees`)

## Qué hace

Expediente de cada empleado: ficha personal, datos de pago, dirección, foto, documentos,
rostro para el kiosco y contratos. También mantiene el catálogo de puestos.

Rutas: `/employees` (lista), `/employees/new` (alta), `/employees/[id]` (perfil con tabs),
`/settings/employees/positions` (puestos).

## Documentos de este módulo

| tema                                                                                          | archivo                                      |
| --------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Contratos: qué se edita, cuándo aplica el cambio, sucursal base, terminar y revertir          | [docs/contratos.md](docs/contratos.md)       |
| Alta (wizard y `crear_empleado_completo`), datos de pago, dirección, documentos, foto, rostro | [docs/alta-y-ficha.md](docs/alta-y-ficha.md) |

## Reglas de negocio (resumen)

- **Un solo contrato vigente**, y **se edita siempre**. Lo ya calculado en planilla conserva
  sus montos; el cambio entra en el próximo período, **o en el abierto si se recalcula**.
- **No se editan:** la fecha de inicio, un contrato con terminación registrada, ni la
  sucursal base mientras haya una quincena sin pagar.
- **Salir son dos pasos:** RRHH termina el contrato y contabilidad lo liquida. Hasta liquidar
  se puede revertir; después, no.
- **El expediente es de la empresa, no de una sucursal.** La sucursal base del contrato dice
  en qué planilla se paga y qué gerente lo ve.
- Los datos de pago van **cifrados** y en una tabla aparte. Una cuenta repetida se avisa,
  pero no se bloquea.

## Datos

| tabla / RPC                                                                      | permiso                                                 | definida en                                                                         |
| -------------------------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `sgrh_empleados`                                                                 | `EMPLEADOS_READ` / `EMPLEADOS_WRITE`                    | `20260101000200_tablas_core.sql`                                                    |
| `sgrh_historial_laboral` (contratos)                                             | `HISTORIAL_READ` o `EMPLEADOS_READ` / `HISTORIAL_WRITE` | `20260101000200_tablas_core.sql`                                                    |
| `sgrh_empleado_datos_pago`                                                       | `NOMINA_READ` o `EMPLEADOS_WRITE`                       | `20260101000200_tablas_core.sql` (cifrado: `20260824120000_datos_pago_cifrado.sql`) |
| `sgrh_direcciones`                                                               | según la entidad que la referencia                      | `20260101000200_tablas_core.sql`                                                    |
| `sgrh_documentos`                                                                | `DOCUMENTOS_READ` / `DOCUMENTOS_WRITE`                  | `20260101000300_tablas_operativas.sql`                                              |
| `crear_empleado_completo` (DEFINER)                                              | `EMPLEADOS_WRITE` (+ `USUARIOS_WRITE` para invitar)     | `20260824120000_datos_pago_cifrado.sql`                                             |
| `crear_contrato`, `editar_contrato`, `terminar_contrato`, `revertir_terminacion` | `HISTORIAL_WRITE`                                       | ver [contratos](docs/contratos.md)                                                  |

Policies: `20260101000600_rls_policies.sql`. En todas, el propio empleado ve lo suyo por la
rama `emp_id = get_emp_id()`.

## Trampas

- **Los grupos de campos compartidos (`EmployeeFields`, `ContractFields`) usan container
  queries** (`@sm:`, `@2xl:`). El formulario que los use necesita un ancestro con
  `@container` (lo pone `EmployeeForm`). Sin él, la grilla queda en una columna y se ve
  "estirada", sin ningún error.
- **`ContractFields` tiene dos flags** (`mostrarSucursal`, `mostrarFechaInicio`, default
  `true`) para que el wizard no se entere de lo que oculta el modo editar. Al agregar un campo
  condicional, el default es el comportamiento del wizard.
- **Los `defaultValues` del formulario los pone el llamador, no el schema.** Un test afirmaba
  que la sucursal viajaba al guardar y pasaba, porque probaba `ContractForm` con un fixture
  completo mientras la pantalla real no le pasaba `lab_sucursal_id`. Si la afirmación es
  "viene precargado", el test monta la pantalla, no el formulario aislado.
- **`crear_empleado_completo` no se pasa a `INVOKER`**: ver por qué en
  [alta-y-ficha](docs/alta-y-ficha.md).
