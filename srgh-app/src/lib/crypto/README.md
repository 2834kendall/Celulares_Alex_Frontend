# Cifrado de campos (`lib/crypto`)

## Qué hace

Cifra columnas sensibles antes de que lleguen a Postgres. Hoy es una sola: el número de cuenta
del empleado (`sgrh_empleado_datos_pago.edp_numero_cuenta`), que se guarda como
`v1:<iv>:<ciphertext>` (AES-256-GCM). Postgres nunca ve el número en claro.

La RLS sigue decidiendo quién lee la fila. Lo que cambia es que tener acceso a la base ya no
alcanza para leer el número.

## Llaves

En `.env.local`, validadas en `lib/env.server.ts`. Son 32 bytes en base64 cada una
(`openssl rand -base64 32`):

| variable               | para qué                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| `FIELD_ENCRYPTION_KEY` | cifrar y descifrar                                                                           |
| `FIELD_INDEX_KEY`      | índice ciego (`edp_cuenta_hmac`, HMAC-SHA256), para detectar cuentas repetidas sin descifrar |

**Si se pierde `FIELD_ENCRYPTION_KEY`, no hay forma de recuperar los números de cuenta.**
Respaldala fuera del `.env.local` y usá la misma en todos los entornos que apunten a la misma
base. Un respaldo de la base **no** incluye las llaves.

Backfill de filas viejas: `pnpm encrypt:payment-data` (dry-run) y después `-- --apply`, una
vez por proyecto.

## Las tres formas de perder datos

Las tres ya pasaron, o casi:

1. **Ninguna transformación de texto puede tocar una columna cifrada.** El
   `upper(regexp_replace(...))` que la RPC aplicaba al número de cuenta era inofensivo sobre
   un IBAN, pero **destruye el base64 en silencio**: no falla, guarda basura y el dato original
   deja de existir. Al cifrar una columna, hay que buscar y borrar toda normalización que la
   toque, en SQL y en TS.
2. **"No se pudo descifrar" NO es "no hay dato", y confundirlos borra el dato.** Si
   `decryptField` devolviera `string | null`, una fila ilegible llegaría a la UI igual que una
   vacía: el formulario se pinta en blanco, alguien edita el teléfono, y el upsert escribe
   `null` encima del ciphertext. Es irreversible. Por eso devuelve una unión discriminada (el
   compilador obliga a tratar el tercer caso), y `updateEmployee` conserva la columna cuando el
   campo llega vacío y lo guardado es ilegible. Escribir un valor nuevo sí pisa siempre: así se
   repara una fila corrupta. **Vale para cualquier columna que se cifre en el futuro.**
3. **El ciphertext y el índice ciego se escriben siempre juntos.** Un `edp_cuenta_hmac`
   huérfano hace que la detección reporte duplicados contra un número que ya nadie tiene. Lo
   fuerza el constraint `edp_cuenta_hmac_pareado`, no la disciplina de quien edite las
   acciones.
   - **Ojo con su ventana:** es `NOT VALID`, y `NOT VALID` **sí** se aplica a las filas que se
     actualizan. Entre el deploy y el backfill, guardar una fila cifrada sin índice da `23514`.
     Falla de forma segura (error, no borrado), y se cierra corriendo el backfill apenas
     termina el deploy.

## Trampas

- **El núcleo no puede importar nada de Next.** `scripts/encrypt-payment-data.ts` corre con
  `node --experimental-strip-types`, así que `fieldCrypto.core.ts`:
  - no puede importar `server-only` ni usar `enum` o `namespace`;
  - lleva los imports con la extensión `.ts` explícita (de ahí `allowImportingTsExtensions` en
    el tsconfig);
  - cruza los tipos solo con `import type`. Node no infiere qué binding es un tipo, y con un
    import normal el script revienta en runtime, no en build.

  Es el precio de que el backfill reuse la criptografía en vez de duplicarla.

- **Cobertura 100 % obligatoria** en `lib/crypto/**` (`vitest.config.ts`). Si tocás algo acá,
  corré `pnpm test:coverage` antes de darlo por cerrado.

Migración: `20260824120000_datos_pago_cifrado.sql`.
