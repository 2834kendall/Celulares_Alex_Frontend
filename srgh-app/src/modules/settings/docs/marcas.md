# Marcas comerciales

Configuración → Empresa → Marcas (`/settings/profile?tab=marcas`). Código en
`modules/settings/brands/`.

## Qué es una marca

Una empresa puede operar varias marcas con identidad propia ("Celulares Alex", "Infinity"), y
cada marca agrupa varias tiendas físicas: **Empresa → Marca → Sucursal**.

- **Es agrupación + identidad visual** (nombre, colores, logo). **No es un límite de alcance**:
  no entra al JWT ni a ninguna policy. La RLS operativa sigue siendo por sucursal
  (`sucursal_visible()`), y el alcance lo sigue decidiendo `uer_sucursal_id`.
- **Los empleados son de la empresa**: alguien de una marca puede trabajar un turno en una
  tienda de otra si el horario lo dice. Ninguna relación con la sucursal cambió (historial
  laboral, marcas de asistencia, programación, planilla, kioscos).
- Toda sucursal pertenece a una marca de **su misma empresa**. Lo garantiza una FK compuesta
  `(suc_marca_id, suc_empresa_id)`, también ante un `UPDATE` directo.

## Pantalla

Pestaña de Empresa, no sección propia: hay pocas marcas y tienen pocos datos. Cada marca es una
tarjeta (`BrandCard`) que muestra su identidad como se ve en la app, con lo heredado incluido, y
cada acción abre un modal: logo, editar (nombre y estado) y colores; en el menú `⋯`, ver la app
con esa marca y eliminar. No hay página por marca.

Las sucursales de una marca no se listan acá: la tarjeta enlaza a `/settings/branches?marca=<id>`.
Ese filtro vive en la URL y lo conservan "Nueva sucursal", la ficha y sus botones de volver.

## Permisos y escritura

- Todo con `EMPRESAS_WRITE` (no hay permiso propio de marcas).
- **Ninguna escritura desde el cliente.** La RLS deja **leer** las marcas de la propia empresa a
  cualquier usuario, porque el shell las pinta a todos. Escriben solo las RPC de servidor
  `sgrh_save_brand` y `sgrh_delete_brand`, que revalidan en vivo al administrador con
  `sgrh_assert_branch_admin` y auditan en `sgrh_config_auditoria` (entidad `marca`).
- `sgrh_save_brand` solo toca las claves que llegan en `p_data`: datos, colores y logo se guardan
  por separado sin pisarse.
- **Desactivar** se rechaza si tiene sucursales activas. Una marca inactiva no se ofrece al crear
  o mover sucursales, pero una sucursal puede conservar la que ya tenía, y sigue reservando su
  nombre.
- **Eliminar** es para una marca creada por error: solo si no tiene ninguna sucursal, ni activa ni
  inactiva. La RPC devuelve la ruta del logo y el servidor borra el objeto después. Una marca con
  historia se desactiva.

## El tema: de dónde sale cada color

`lib/empresa/resolve-shell-theme.ts` es la fuente única:

```
marca en preview (solo EMPRESAS_WRITE)
  → marca propia
  → tema de la empresa (Configuración → Empresa → Apariencia)
  → colores del sistema
```

- **Cada color cae por separado**: una marca que solo personalizó el acento hereda la barra de
  la empresa. En el formulario cada color tiene "Usar el de la empresa", que guarda `null`: así
  sigue los cambios futuros de la empresa.
- **La marca propia** (`get-marca-tema.ts`) sale de la sucursal de la **cuenta**
  (`uer_sucursal_id`, la de un GERENTE). Si la cuenta no tiene, sale de la sucursal base del
  **contrato vigente**: así el EMPLEADO, cuya cuenta suele no tener sucursal, ve el tema de su
  marca. Un turno prestado en otra marca no le cambia el tema.
- **Logo**: el de la marca, o si no tiene, el de la empresa. Mismo bucket `logos-empresa`, en la
  ruta `<empresa_id>/marcas/<mco_id>/<uuid>`. Un CHECK de la columna y la RPC exigen ese prefijo.
- **Apariencia** (pestaña de Empresa) edita el **tema de la empresa**, y solo la ve
  `EMPRESAS_WRITE`. Entre los roles activos no le quita nada a nadie: GERENTE y EMPLEADO nunca
  entraron a Configuración. Es para los roles inactivos con acceso a la zona sin ese permiso.
- **Elegir colores no pinta la app**: `AppearanceForm` muestra una maqueta (`ThemePreview`) con
  los tokens en su propio contenedor. Antes pintaba el shell real en vivo, y el marco quedaba con
  el color de prueba, mezclado con el nombre y el logo de otra marca.

## Selector de la barra superior

`MarcaSwitcher` ("Vista previa del tema", cookie `sgrh_marca_preview`) lista las marcas activas y
**solo cambia el tema**. Todavía no filtra datos: eso queda para un ticket aparte. La cookie nunca
entra en una query de datos ni en una policy. Reemplaza a la cookie de sucursal: con otro nombre,
una cookie vieja (que guardaba un id de sucursal) no se lee como id de marca.

- **El nombre de la marca arriba se lee como un filtro**, y no lo es: mientras hay una vista previa,
  `MarcaPreviewBanner` avisa que los datos siguen siendo de todas las marcas.
- **Guardar colores no mueve el selector.** El aviso de guardado ofrece "Ver la app con esta marca".

## Cómo se muestra una sucursal

`formatSucursalLabel` / `sucursalLabel` (`lib/empresa/marca-label.ts`): **"Marca · Sucursal"** en
listados, selects y reportes. Si la sucursal se llama igual que su marca, se muestra un solo
nombre. Es el caso de las sucursales recién migradas, hasta que alguien las renombre.

## Puesta en marcha (en este orden, en cada proyecto)

1. Migraciones `20261107153512_marcas_comerciales.sql` (tabla, `suc_marca_id` **nullable**, tema
   de empresa, RLS y RPC) y `20261108212054_eliminar_marca.sql` (RPC de borrado).
2. Script `supabase/scripts/asignar-marcas-iniciales.sql`, a mano. Crea una marca por sucursal
   con el mismo nombre y colores, y es repetible. Termina mostrando cuántas sucursales quedaron
   sin marca: tiene que dar **0**.
3. Deploy del frontend.
4. **Fase 2, en un PR aparte**: `suc_marca_id NOT NULL` y retiro de `suc_color_*`, que el frontend
   ya no lee. No viaja junto con la fase 1 porque un `db push` aplicaría las dos antes de que
   corra el script.

**El orden no es opcional.** La compatibilidad es en un solo sentido:

- **Frontend anterior + base migrada: funciona.** Si `suc_marca_id` no viene en `p_data`,
  `sgrh_save_branch` no cambia la marca.
- **Este frontend + base sin migrar: se rompe buena parte de la app.** Las lecturas piden una
  relación y unas columnas que no existen. Sin la fila de la empresa, el shell pierde logo, nombre
  y formato de hora, y fallan los listados que muestran "Marca · Sucursal".

## Pruebas

- `brands/migration.test.ts` corre el SQL real (la migración y el script) en un PostgreSQL
  desechable (PGlite). Cubre la RLS entre empresas, la FK compuesta, el cliente sin escritura y
  que el script sea repetible. Cada guard se verificó quitándolo y viendo fallar su test.
- En dev también se probó con roles reales (skill `rpc-rls-test`): `authenticated`, `anon` y
  `service_role`, más los joins anidados a través de PostgREST. **Hay que repetirlo en cada
  proyecto**: los tests mockean Supabase y PGlite no pasa por PostgREST.
