# Respaldos antes de cada push a producción

> **Pendiente: el script no está en el repo.** Este procedimiento describe
> `scripts/backup-db.mjs` y `pnpm db:backup`, pero ninguno de los dos existe en `dev` ni en
> ninguna otra rama (verificado el 2026-11-07). Hasta que se agregue, el equivalente manual es
> `supabase db dump --linked` tres veces: con `--role-only`, sin flags (esquema) y con
> `--data-only`, cada una a su archivo con `-f`, fuera del repo. Todo lo de abajo sobre Docker,
> llaves y Storage aplica igual.

El script, tal como estaba diseñado, saca un respaldo lógico del proyecto **vinculado** (esquema, datos y
roles) y lo deja **fuera del repo**, en `~/sgrh-backups/<fecha>_<ref>/`. El ref va en el
nombre de la carpeta a propósito: tres meses después nadie se acuerda de si eso era dev o
producción.

## Cuándo

**Es un paso del checklist de migración, no una tarea programada.** Producción cambia pocas
veces al año, y el desastre realista no es un disco quemado: es una migración mal escrita o un
`UPDATE` sin `WHERE`. Contra eso sirve el respaldo que tomás _justo antes_ del push. Los
respaldos automáticos del plan Pro cubren el otro caso, no este.

## Antes de confiar en él

- **Necesita Docker corriendo.** `supabase db dump` ejecuta `pg_dump` dentro de un
  contenedor. Sin Docker, el comando falla **pero igual deja el archivo creado y vacío**, y un
  archivo de 0 bytes es peor que ninguno porque parece un respaldo. El script chequea Docker
  antes de crear nada, verifica tamaño y contenido de cada pieza, y borra el respaldo
  **entero** si alguna no pasa.
  - Docker puede quedar sin salida a internet aunque el host la tenga. Si
    `docker pull hello-world` falla y `curl` a `auth.docker.io` responde 200, es la red de la
    VM de Docker Desktop: se arregla reiniciándolo o fijándole el DNS.
- **El dump NO contiene las llaves de cifrado ni la configuración del Dashboard.** Restaurarlo
  solo no deja el sistema funcionando:
  - faltan `FIELD_ENCRYPTION_KEY` y `FIELD_INDEX_KEY`. Sin ellas, los números de cuenta son
    irrecuperables (ver [cifrado](../../src/lib/crypto/README.md));
  - faltan los [pasos manuales](proyectos-y-pasos-manuales.md) del Dashboard.

  Cada respaldo lleva un `MANIFIESTO.txt` que lo detalla y da el orden de restauración.

- **Tampoco trae los objetos de Storage.** Los buckets son filas y sí vienen en el dump; las
  fotos, documentos y CVs que tienen adentro, no.

## Problemas conocidos

- Si el CLI falla con `failed to initialise login role`, exportá `SUPABASE_DB_PASSWORD` en la
  terminal antes de correrlo. El script detecta ese caso y lo explica.
- **Un respaldo que nunca se restauró no es un respaldo.** Conviene ensayar la restauración
  contra dev al menos una vez.
