# Dashboard (`dashboard`)

> Pendiente de revisión del dueño del módulo. Escrito a partir del código el 2026-11-07.

## Qué hace

`/dashboard` es la **página de inicio de todos los roles**: un tablero de paneles que cada
persona puede reordenar, redimensionar u ocultar ("Personalizar").

**El dashboard no tiene reglas propias.** Cada panel carga con la acción de su módulo, y
`lib/summaries.ts` solo resume lo que ese módulo ya sabe: si Asistencia dice que alguien llegó
tarde, acá también.

## Paneles

`lib/panels.ts` es la **fuente única**: la página decide qué cargar a partir de ahí, el tablero
los acomoda y la bandeja de "Personalizar" los lista. **Agregar un panel = una entrada en
`panels.ts` + su nodo en la página.**

| panel                                                                                              | lo ve quien tiene                                          |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Asistencia de hoy · Tardías del mes                                                                | `ASISTENCIA_READ`                                          |
| Cumpleaños · Aniversarios laborales · Equipo por sucursal · Nuevos ingresos · Contratos por vencer | `EMPLEADOS_READ`                                           |
| Nómina                                                                                             | `NOMINA_READ`                                              |
| Liquidaciones pendientes                                                                           | `NOMINA_WRITE`                                             |
| Reclutamiento                                                                                      | `RECLUTAMIENTO_READ`                                       |
| Ausencias de la semana                                                                             | `AUSENCIAS_READ`                                           |
| Horarios de la semana                                                                              | `HORARIOS_READ` o `HORARIOS_WRITE`                         |
| Evaluaciones                                                                                       | `EVALUACIONES_READ` o `EVALUACIONES_WRITE`                 |
| Mi semana · Mis marcas de hoy · Mis ausencias · Mis evaluaciones                                   | `MI_HORARIO_READ` (los datos personales los filtra la RLS) |

**`allowed` es UX y una primera barrera, como el menú lateral**: cada panel vuelve a chequear su
permiso cuando carga, en la acción de su módulo.

## Reglas de negocio

- **Nada de esto puede tirar la página de inicio.** Sin el permiso, o si una consulta falla,
  el panel se degrada (`canSee: false`) y el resto de la página sigue. A diferencia de las demás
  acciones, `getDashboardPeople` **no redirige** cuando falta el permiso.
- **Un panel oculto no se consulta.** El servidor lee las preferencias antes de cargar nada.
- **Personas** (`getDashboardPeople`): cumpleaños, aniversarios y plantilla por sucursal salen
  de **un solo par de consultas** (empleados + contratos vigentes).
  - Solo cuentan los contratos activos, y no se firman fotos de exempleados.
  - **El año de nacimiento no se expone**: el panel muestra día y mes.
- **Extras** (`getDashboardExtras`): ausencias de la semana, evaluaciones del año, contratos por
  vencer y las marcas propias del día. Los contratos vigentes se leen una vez por request
  (`React.cache`), aunque haya varios paneles prendidos.
- **Fechas:** todo trabaja con cadenas `YYYY-MM-DD` y aritmética UTC, y "hoy" lo pasa quien
  llama (el día calendario de Costa Rica). El resultado no depende de la zona del servidor.

## Preferencias del tablero

- Se guardan en una **cookie** (`sgrh-dashboard`, un año), no en localStorage ni en la base:
  - el servidor la necesita antes de cargar, para no consultar paneles ocultos y para que el
    HTML llegue ya acomodado;
  - es una comodidad personal por navegador: perderla solo vuelve al orden por defecto.
- **La cookie recuerda de quién es**: si otra persona inicia sesión en ese navegador, se ignora
  y ve el orden por defecto.
- Es entrada del navegador: se valida con su schema y, ante cualquier cosa rara, se usa el
  orden por defecto.
- Se guarda con un **route handler** (`app/api/dashboard/prefs`), no con una Server Action: una
  acción que escribe cookies obliga a Next a renderizar toda la página otra vez, y el dashboard
  son una docena de consultas. Solo pide sesión iniciada.

## Trampas

- **`/dashboard?demo=1`** carga personas inventadas (`lib/demoData.ts`) para ver el panel de
  cumpleaños lleno. Solo fuera de producción; esos datos nunca se consultan ni se guardan.
- **No agregar reglas de negocio acá.** Si un número del dashboard no cuadra, el arreglo va en
  el módulo dueño del dato.
- La cola de guardado de preferencias mantiene el orden: un fallo no bloquea los siguientes, y
  una redirección al login no cuenta como éxito.
