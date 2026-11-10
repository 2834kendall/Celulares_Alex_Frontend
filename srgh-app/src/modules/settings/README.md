# Configuración (`settings`)

## Qué hace

Es un **modo**, no una pantalla (SGRH-92). En `/settings…` el sidebar (y el drawer móvil)
reemplaza el menú principal por `SettingsSidebarNav`: "← Volver" a la última pantalla de fuera
de Configuración (`lib/returnPath.ts`, en sessionStorage), búsqueda y dos grupos.

| grupo   | ajuste                          | ruta                                                                                          |
| ------- | ------------------------------- | --------------------------------------------------------------------------------------------- |
| Empresa | Empresa: Información            | `/settings/profile`                                                                           |
|         | Empresa: Apariencia (tema)      | `/settings/profile?tab=apariencia`                                                            |
|         | Empresa: Marcas (logo, colores) | `/settings/profile?tab=marcas` ([marcas](docs/marcas.md), [selector](docs/contexto-marca.md)) |
|         | Sucursales y kioscos            | `/settings/branches` ([detalle](docs/sucursales-y-kioscos.md))                                |
|         | General (formato de hora)       | `/settings/general`                                                                           |
| Módulos | Puestos                         | `/settings/employees/positions`                                                               |
|         | Tipos de tardía                 | `/settings/attendance/tardiness-types`                                                        |
|         | Tipos de incapacidad            | `/settings/schedule/absence-types`                                                            |
|         | Etapas y criterios de selección | `/settings/recruitment/{stages,criteria}`                                                     |

`/settings` y `/settings/<módulo>` redirigen al primer ajuste visible. **Ctrl/⌘+K** abre
`SettingsSearch`, solo en modo configuración; también encuentra las pestañas de Empresa
(`subpages` en `sections.ts`). `/settings/appearance` redirige a su pestaña.

## Reglas de negocio

- **`lib/sections.ts` es la fuente única** de ajustes, visibilidad, palabras clave del
  buscador y redirects. Cada subpágina la valida con `requireSettingsSection(<id de hoja>)`.
- **Configuración solo COMPONE.** El código de cada catálogo vive en su módulo dueño: puestos
  en `employees`, tipos de tardía en `attendance`, etapas y criterios en `recruitment`. En
  `modules/settings` queda solo lo de la empresa y el armazón del menú.
- **Lo que NO se vuelve configurable:** los catálogos globales o legales (tipos de contrato,
  jornadas, conceptos de planilla) no tienen `empresa_id`. No son configuración por empresa.
- Rutas, ids y nombres de código en inglés; textos de UI en español.

## Información de la empresa (`EMPRESAS_WRITE`)

- Identidad, contacto y dirección se guardan con la RPC `actualizar_perfil_empresa`
  (`SECURITY DEFINER`, `20261006120000_perfil_empresa.sql`). La RLS de `sgrh_direcciones` no
  cubre la dirección de la empresa. Si otra sucursal o empleado comparte esa fila, la RPC crea
  una nueva. La cédula jurídica es de solo lectura.
- **El logo va al bucket privado `logos-empresa`** (2 MB, `<empresa_id>/logo/<uuid>`).
  `org_logo_url` guarda la **RUTA, no una URL**: se firma en cada carga (`getEmpresaLogoUrl`) y
  se muestra con `<CompanyLogo/>`. La subida usa `ImageUploadModal` + `PhotoDropzone`
  (`components/ui`), compartidos con la foto del empleado.

## Trampas

- **Agregar una pantalla de catálogo acá en vez de en su módulo** es el error fácil.
- **`SettingsSearch` la monta el AppShell UNA sola vez**: el drawer y el sidebar pueden estar
  montados a la vez.
- **Puestos tiene dos lecturas:** `getPuestos` (activos, para los selects) y `listPuestos`
  (todos, para administrar).
- **Las etapas de selección son globales y se editan desde acá** (heredado de SGRH-61): una
  empresa las cambia para todas. Es deuda conocida, no un modelo a imitar.

## Pendiente

Tipos de turno, rubros de evaluación y conceptos de planilla todavía se editan en sus propias
pantallas, fuera de Configuración.
