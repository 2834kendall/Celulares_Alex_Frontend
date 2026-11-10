# Selector de marca: filtrar los datos

El selector de la barra superior elige una marca: los listados muestran solo sus tiendas y el shell
se pinta con su tema. Código en `lib/empresa/contexto-activo.ts`. Qué es una marca:
[marcas](marcas.md).

**No es un límite de seguridad.** No entra al JWT ni a ninguna policy. Solo achica lo que la cuenta
ya puede ver, y **no limita asignar**: un empleado puede trabajar cualquier día en una tienda de otra
marca.

## Quién lo ve

Nunca se decide por rol: los roles se pueden crear y editar. Aparece si se cumplen las dos condiciones:

1. La cuenta tiene algún permiso de `PERMISOS_DATOS_POR_MARCA` (`lib/permissions/zones.ts`). La lista
   sale de lo que pide cada lectura filtrada, no de las zonas: con solo `COMPROBANTES_READ`, Nómina es
   un placeholder.
2. Sus tiendas abarcan dos o más marcas activas. Una cuenta de nivel empresa alcanza todas.

El permiso va primero: una cuenta sin datos operativos también da alcance `null`.

## Las dos lecturas

| lectura            | la usa                 | qué hace                                              |
| ------------------ | ---------------------- | ----------------------------------------------------- |
| `getFiltroMarca`   | los listados           | `sin-filtro`, `filtrado` con `sucursalIds`, o `error` |
| `getSelectorMarca` | el layout y las marcas | las marcas elegibles y la elegida; no filtra nada     |

- **Mira la cookie primero.** Sin cookie no hace ninguna consulta. El layout no se re-renderiza al
  navegar, así que este costo se pagaría en cada listado.
- **`error` no es "sin filtro".** Con cookie y lectura fallida el listado muestra el error: traer todo
  con el aviso nombrando una marca sería mentir. El Dashboard no se cae, y el panel dice que no cargó.
- **`sucursalIds` incluye tiendas inactivas**, porque los registros viejos apuntan a ellas. Ya sale
  acotado al alcance: cada lectura usa `filtro.sucursalIds ?? alcance`.
- **Una tienda sin marca** (`suc_marca_id` admite `NULL` hasta la fase 2) solo sale en "Todas".

## La cookie

`sgrh_marca_contexto` guarda `{ u: usrId, m: marcaId }`, dura un año y es httpOnly.

- **Atada al usuario:** en una máquina compartida, otra cuenta la ignora, aunque la sesión anterior
  haya vencido sin pasar por `logout`. Además, `logout` la borra.
- **Larga a propósito:** si venciera con la pestaña abierta, la página traería todo mientras el aviso
  seguiría nombrando la marca.
- **Se revalida en cada lectura:** una marca falsificada, de otra empresa, desactivada o fuera de
  alcance se ignora.
- **Riesgo aceptado:** con la pestaña abierta, si la marca se desactiva o se pierde el permiso, el aviso
  queda viejo hasta el siguiente render completo.

## Qué columna filtra cada pantalla

La del registro, igual que la RLS.

| pantalla                      | se filtra por                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------- |
| Empleados                     | contrato vigente; un exempleado, su último contrato; sin contrato, solo "Todas" |
| Horarios                      | base en la marca **o** algún día de la semana en una de sus tiendas             |
| Asistencia                    | como un gerente de esas tiendas: `prg_`, `mar_` y plantilla por `lab_`          |
| Evaluaciones                  | `lab_sucursal_id`                                                               |
| Reclutamiento                 | `pos_sucursal_id`; sin tienda, solo "Todas"                                     |
| Periodos                      | `npe_sucursal_id`                                                               |
| Por liquidar                  | `lab_sucursal_id`                                                               |
| Banco de horas, liquidaciones | sucursal del contrato, **en memoria**                                           |
| Aguinaldo                     | sucursal de la fila, **después de calcular**                                    |
| Dashboard                     | contrato vigente; el resto de los paneles lo hereda                             |
| Configuración → Sucursales    | `?marca=<id>` manda, `?marca=todas` es explícito, sin parámetro aplica la marca |

## Lo que NO se filtra

- **Asignar:** la lista de tiendas de la matriz, `branchesBelongToEmpresa`, los formularios y toda
  escritura.
- **Montos:** ver abajo.
- **Advertencias del mes:** `checkMonthlyInfractions` pasa `null`; con la marca contaría de menos.
- **Kiosco**, y `/settings/branches/pending` (borradores locales de ese navegador).
- **Fichas y detalles:** un enlace directo sigue abriendo.
- **Pantallas personales** y **cuentas de usuario**: la pestaña lo avisa.

## Trampas

- **El aguinaldo se filtra después de calcular.** `calcularAguinaldosDelCiclo` recibe una lista de
  sucursales visibles. Si recibiera la marca, una persona trasladada quedaría con `sucursalesOcultas`:
  monto de menos y sin poder pagar.
- **Una ausencia no se filtra en la acción.** Un empleado de A con turno en B sale en la matriz de B. Sin
  su ausencia, la celda de ese día quedaría editable y "Pegar" la pisaría. Solo el panel se acota, con
  `ausenciasDelPanel`.
- **El sexto parámetro de `gatherMonthlyAttendanceDays` es obligatorio.** `React.cache` distingue por
  cantidad de argumentos: si un llamador lo omitiera, se repetirían ~7 consultas también sin filtro.
  Vitest no lo detecta, porque ahí `cache` no memoiza. Se mide con `SGRH_DEBUG_TIMING=1`.
- **Sin `!inner`, filtrar sobre un join devuelve la fila con el join en `null`** ("Empleado no
  disponible"), y los mocks no lo notan. Por eso Banco de horas y Liquidaciones filtran en memoria.
- **Cambiar la marca vuelve a montar la página** (`key` en el layout). Por eso `useElegirMarca` pide
  confirmación si hay cambios sin guardar, y es la única forma de cambiarla.

## Pruebas

En E2E, `brand-context.spec.ts` usa **roles inventados** con permisos elegidos, para demostrar que
nada depende de un rol conocido.
