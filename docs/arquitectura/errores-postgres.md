# Errores de Postgres y su mensaje en la UI

No hay un mapeo central: **cada módulo traduce los errores de su dominio** (por ejemplo,
`modules/employees/lib/dbErrors.ts`, `attendance/lib/tipoTardiaErrors.ts`,
`absences/lib/tipoAusenciaErrors.ts`). Lo que sí es común es la convención.

## La convención

**Las RPC y los guards del repo levantan sus errores con un código estándar y un mensaje
escrito para mostrarse tal cual en la UI**, en español:

```sql
RAISE EXCEPTION 'Solo se puede editar el contrato vigente.' USING ERRCODE = '23514';
```

Del lado de Next, para esos códigos se muestra `error.message`; para cualquier otro, un mensaje
genérico de la acción. Nunca se muestra un error de Postgres que no escribimos nosotros.

## Los códigos que aparecen

| código | nombre | cuándo lo vemos | qué muestra la UI |
|---|---|---|---|
| `23505` | unique violation | un dato único repetido (cédula, correo, un contrato vigente de más) | mensaje por campo: el nombre de la restricción o la columna viene en `message`/`details` |
| `23514` | check violation | **los guards de negocio del repo** (un contrato que no se puede editar, salarios en 0…) y los `CHECK` de las tablas | `error.message` |
| `23503` | foreign key violation | un id que no existe o es de otra empresa (puesto, sucursal, tipo) | `error.message` |
| `42501` | insufficient privilege | falta de permiso dentro de una RPC; **también** falta de `EXECUTE` sobre una función o de `USAGE` sobre un esquema | `error.message` o "No tenés permiso…" |
| `0A000` | feature not supported | llamar directo a una función `RETURNS trigger`, o un `DEFAULT` que referencia otras columnas | no debería llegar a la UI |
| `PGRST202` | función no encontrada (PostgREST) | la RPC no existe: falta aplicar una migración | aviso de configuración |

## Trampas

- **Un `42501` puede no ser "el usuario no tiene permiso".** Si dice `permission denied for
  schema` o `for function`, es un grant que falta en la base, no un rol mal configurado. Ver
  [RLS y alcance](../../srgh-app/supabase/docs/rls-y-alcance.md).
- **Una escritura que la RLS filtra no da ningún error**: afecta 0 filas y la acción "sale
  bien". Si una acción tiene que confirmar que escribió, tiene que mirar las filas afectadas
  (`.select()` después del update).
- Para reproducir un error con un usuario real, sin ensuciar la base: transacción con
  `SET LOCAL ROLE authenticated` + claims de prueba + `ROLLBACK` (skill `rpc-rls-test`).
