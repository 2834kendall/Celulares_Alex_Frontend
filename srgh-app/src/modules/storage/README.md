# Archivos (`storage`)

## Qué hace

Núcleo de archivos **desacoplado del proveedor** (SGRH-60 / SGRH-67, cerrado): fotos de
empleado, documentos del expediente y logo de la empresa. Lo usan `employees` y `settings`.

## Cómo está armado

El port vive en `src/lib/storage/`:

| archivo                            | rol                                                               |
| ---------------------------------- | ----------------------------------------------------------------- |
| `lib/storage/types.ts`             | el contrato, sin un solo import de Supabase                       |
| `lib/storage/supabase-provider.ts` | **el ÚNICO archivo del repo que importa `supabase.storage`**      |
| `lib/storage/index.ts`             | `getStorageProvider()`: cambiar de proveedor es cambiar su return |

En `modules/storage/` solo queda `lib/storageErrors.ts`, que consumen las acciones de
`employees`. El laboratorio temporal (`/settings/storage-lab`) ya se eliminó.

## Reglas de negocio

| bucket (privado)       | tope  | permiso de lectura                     |
| ---------------------- | ----- | -------------------------------------- |
| `fotos-empleados`      | 5 MB  | `FOTOS_READ`                           |
| `documentos-empleados` | 10 MB | `DOCUMENTOS_READ` / `DOCUMENTOS_WRITE` |
| `logos-empresa`        | 2 MB  | ver [settings](../settings/README.md)  |

- **La RLS de Storage se aplica por el primer segmento de la ruta** (`<empresa_id>/…`). Esa
  ruta **se arma siempre en el servidor desde el JWT, nunca la manda el cliente**.
- La metadata de los documentos está en `sgrh_documentos`, con el catálogo global
  `sgrh_cat_tipos_documento`.
- **Los documentos nunca se abren inline**: solo descarga forzada (URL firmada de 60 s +
  `downloadAs`).

## Trampas

Estas reglas parecen de más, pero no lo son:

- **Los permisos de archivos son propios y NO se derivan de `EMPLEADOS_*`, a propósito.** El
  rol KIOSCO (una tablet expuesta, con sesión permanente) tiene `EMPLEADOS_READ` y **no tiene
  que poder firmar archivos**.
- **El tipo se valida por magic bytes**: el `file.type` del cliente nunca decide. SVG está
  prohibido en todos los buckets.
- **Cobertura 100 % obligatoria** en `lib/storage/**` (`vitest.config.ts`).

Policies de Storage: `20260101000700_storage_policies.sql`.
