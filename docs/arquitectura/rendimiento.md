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

## Pendiente

- Payroll todavía tiene llamadas a `router.refresh()` después de acciones que revalidan: es
  deuda abierta.
