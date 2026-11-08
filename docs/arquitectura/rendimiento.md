# Rendimiento

## Lo que cuesta es la cantidad de viajes en serie, no las filas

Supabase está en us-east-1: desde Costa Rica, **cada consulta tarda ~200 ms**. Una página con
cinco consultas encadenadas tarda un segundo aunque traiga diez filas.

- **Las lecturas independientes van siempre en `Promise.all`**, en la página y dentro de cada
  acción. Solo se encadena lo que de verdad depende de un resultado anterior.
- `createClient` y la lectura de la sesión (`requirePermission`) están memoizados por request
  con `React.cache`: una página con diez guards verifica el JWT una sola vez.

**Para medir:** `SGRH_DEBUG_TIMING=1` en `.env.local` loguea en la terminal cada consulta del
servidor a Supabase con su duración (`lib/supabase/timedFetch.ts`). Muestra cuántas consultas
hace una página y cuáles van en serie.

## Lectura y escritura

- **Leer en Server Components; escribir con Server Actions + `revalidatePath`.** No hay
  librería de estado del lado del cliente (TanStack Query se instaló al principio, nunca se usó
  y se quitó).
- **No agregar `router.refresh()` después de una acción que revalida.** Si la acción llamó a
  `revalidatePath`, Next ya devuelve la página re-renderizada en la misma respuesta;
  `router.refresh()` dispara un segundo render con todas las consultas otra vez. Solo hace falta
  cuando la acción no revalida nada (p. ej. `enrollFace`) o en los flujos de sesión. Una acción
  que escribe cookies (el login) ya invalida la caché del router sola.

## Catálogos cacheados

- Los catálogos **globales** (territorio, bancos, tipos de contrato…) se leen del Data Cache de
  Next (`unstable_cache`, ver `modules/employees/actions/getCatalogs.ts`).
- Se leen con el **cliente admin**, porque `unstable_cache` no admite `cookies()`. Eso solo vale
  para tablas globales (`cat_select USING (true)`). **Un catálogo por empresa (puestos,
  sucursales) cacheado así se saltaría la RLS de tenant.**
- El `requirePermission` va siempre **fuera** del caché.

## En la base

| decisión | impacto |
|---|---|
| `emp_id` en el JWT | elimina una subconsulta anidada por fila en las tablas operativas |
| `tiene_permiso()` lee el JWT | elimina dos JOINs por cada evaluación de policy |
| helpers `STABLE` + envueltos en `(SELECT …)` | se evalúan una vez por consulta, no por fila |
| índices sobre las columnas de las policies | `20260929120000_indices_historial_laboral.sql`, `20261007120000_indices_nomina.sql` |

## Local es más lento que producción

Un deploy en la misma región que la base (Vercel `iad1` = us-east-1) paga 1–2 ms por consulta
en vez de ~200 ms. **Mover Supabase a sa-east-1 empeoraría la latencia**: desde Costa Rica el
tráfico sale por Miami, y Virginia queda más cerca que São Paulo. Que las páginas del dashboard
se rendericen en cada request es correcto: dependen de la sesión y de la RLS.

`React.cache` en las lecturas compartidas (alcance de sucursal, tipos de tardía, días del mes)
funciona **porque `createClient` está memoizado**: la clave del caché incluye el cliente. Si se
crea un cliente aparte, se pierde el ahorro (no se rompe nada).

## Pendiente (re-verificado el 2026-11-07)

- **Planilla por lotes, el caso más lento del sistema.** `cargarEmpleadosDesdeAsistencia` hace
  ~7–8 viajes en serie **por empleado** (líneas del detalle + banco de horas): con 20 personas
  son ~150 viajes, ~30 s desde local. Como las filas son nuevas, se pueden juntar las líneas de
  todos y hacer un `insert` por tabla. `uploadPlanilla` tiene los mismos bucles por fila. Vale
  evaluar una RPC transaccional: hoy un fallo a mitad deja la planilla a medias.
- **`router.refresh()` redundante en 8 componentes de payroll**, después de acciones que ya
  revalidan.
- Calidad: el formato de IBAN está duplicado (`formatIbanGroups` en employees, `formatIban` en
  payroll).

## Lo que conviene NO hacer

- **Índices para todas las FK sin índice**: cada uno cuesta en cada escritura. Se agregan
  cuando una consulta real los pide.
- **Optimizar consultas sobre 40 filas**: lo que cuesta es el número de viajes, no el tamaño.
- **Quitar `@vladmandic/face-api`, `onnxruntime-web` o `@mediapipe/tasks-vision`**: entran por
  `import()` dinámico y solo cargan en el kiosco.
- **Cachear páginas del dashboard** o catálogos por empresa con el cliente admin.
