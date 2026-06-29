# Arquitectura Frontend — SGRH

> Documentación técnica de la estructura del proyecto Next.js.
> Enfocada en organización de carpetas, capas de seguridad y criterios de crecimiento.
> Stack: **Next.js (App Router) + TypeScript + Tailwind CSS + Supabase**

---

## Índice

1. [Visión general](#1-visión-general)
2. [Estructura de carpetas](#2-estructura-de-carpetas)
3. [Routing con App Router](#3-routing-con-app-router)
4. [Las tres capas de seguridad](#4-las-tres-capas-de-seguridad)
5. [Convención dentro de cada módulo](#5-convención-dentro-de-cada-módulo)
6. [Manejo de errores y estados de carga](#6-manejo-de-errores-y-estados-de-carga)
7. [Cómo agregar un módulo nuevo](#7-cómo-agregar-un-módulo-nuevo)
8. [Cómo agregar una funcionalidad a un módulo existente](#8-cómo-agregar-una-funcionalidad-a-un-módulo-existente)
9. [Carga de Datos y Gestión de Estado (RSC vs. TanStack Query)](#9-carga-de-datos-y-gestión-de-estado-rsc-vs-tanstack-query)
10. [Validación de Formularios y Datos (Zod + React Hook Form)](#10-validación-de-formularios-y-datos-zod--react-hook-form)
11. [Decisiones consolidadas](#11-decisiones-consolidadas)
12. [Qué NO hacer](#12-qué-no-hacer)
13. [Roadmap de crecimiento](#13-roadmap-de-crecimiento)

---

## 1. Visión general

### Por qué organización por módulo de negocio

El frontend de SGRH crece por dominio (employees, payroll, attendance, recruitment, evaluations, settings), no por tipo técnico (forms, tables, modals). La razón es de equipo, no solo de gusto:

| Organización                           | Problema en equipo de 3+ devs                                                                                             |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Por tipo técnico (`forms/`, `tables/`) | Dos personas tocando módulos distintos terminan editando los mismos archivos compartidos → conflictos de merge constantes |
| **Por módulo de negocio**              | Cada Story de Jira mapea a una carpeta. Una rama por módulo toca casi exclusivamente esa carpeta → conflictos mínimos     |

### Relación con la arquitectura Supabase

Este documento asume que ya existe la base descrita en `SGRH_Supabase_Architecture.md`: Auth con JWT custom claims (`rol`, `empresa_id`, `emp_id`, `permisos`), RLS multi-tenant, y un sistema de permisos dinámico. El frontend **no reimplementa seguridad** — la consume. Cada decisión de estructura aquí existe para que esa seguridad ya construida en la base de datos se exprese correctamente en la UI, sin duplicar lógica ni abrir huecos.

---

## 2. Estructura de carpetas

```
src/
├── app/                              # SOLO routing — page, layout, error, loading
│   ├── (auth)/                       # rutas públicas, sin sesión requerida
│   │   ├── login/
│   │   │   └── page.tsx
│   │   ├── activate-account/
│   │   │   └── page.tsx
│   │   └── loading.tsx
│   ├── (dashboard)/                  # rutas protegidas, comparten layout con sidebar
│   │   ├── layout.tsx                # verifica sesión, monta sidebar/topbar
│   │   ├── loading.tsx
│   │   ├── error.tsx
│   │   ├── employees/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── payroll/
│   │   ├── attendance/
│   │   ├── recruitment/
│   │   ├── evaluations/
│   │   └── settings/
│   ├── unauthorized/
│   │   └── page.tsx
│   ├── layout.tsx                    # root layout — metadata, <html>/<body>
│   └── error.tsx                     # error boundary global, con <html>/<body> propios
│
├── modules/                          # lógica y UI por dominio de negocio
│   ├── employees/
│   │   ├── components/               # todo lo visual de este módulo
│   │   ├── actions/                  # server actions ('use server')
│   │   ├── hooks/                    # hooks específicos del módulo
│   │   └── types.ts                  # DTOs / view models del módulo
│   ├── payroll/
│   ├── attendance/
│   ├── recruitment/
│   └── evaluations/
│
├── components/
│   └── ui/                           # primitivos compartidos entre módulos
│
├── lib/
│   ├── supabase/
│   │   ├── client.ts                 # cliente para Client Components
│   │   ├── server.ts                 # cliente para Server Components / Actions
│   │   └── proxy.ts                  # sincronización de sesión por request (ayudante)
│   ├── permissions/
│   │   └── catalog.ts                # fuente única de verdad de strings de permisos
│   ├── auth/
│   │   └── require-permission.ts     # guard server-side reutilizable
│   └── env.ts                        # validación de variables de entorno
│
├── hooks/
│   └── usePermisos.ts                # compartido — lectura de permisos en cliente
│
├── types/
│   ├── database.types.ts             # generado por Supabase CLI, NO editar a mano
│   └── auth.ts                       # forma del JWT custom (SgrhJwtClaims)
│
└── proxy.ts                           # raíz — invoca lib/supabase/proxy
```

### Regla de oro de esta estructura

> **`app/` solo enruta. `modules/` solo razona. `lib/` solo conecta con el exterior (Supabase, env).**

Si una página (`page.tsx`) tiene más de ~15 líneas de JSX o lógica, esa lógica probablemente pertenece a `modules/<dominio>/components/` y la página debería quedar como ensamblaje delgado:

```typescript
// app/(dashboard)/employees/page.tsx — correcto: capa delgada
import { TablaEmpleados } from '@/modules/employees/components/TablaEmpleados'
import { getEmpleados } from '@/modules/employees/actions/get-empleados'

export default async function EmpleadosPage() {
  const empleados = await getEmpleados()
  return <TablaEmpleados data={empleados} />
}
```

---

## 3. Routing con App Router

La estructura de carpetas dentro de `app/` **es** la URL. Archivos especiales definen comportamiento sin afectar la ruta:

| Archivo         | Función                                                                   | Se hereda hacia hijos            |
| --------------- | ------------------------------------------------------------------------- | -------------------------------- |
| `page.tsx`      | Hace la carpeta navegable                                                 | No aplica                        |
| `layout.tsx`    | Envuelve `page.tsx` y rutas hijas, persiste entre navegaciones            | Sí                               |
| `loading.tsx`   | Se muestra automáticamente vía Suspense mientras carga `page.tsx`         | Sí                               |
| `error.tsx`     | Captura errores de esa rama hacia abajo (no del layout en su mismo nivel) | Sí                               |
| `proxy.ts`      | Corre antes de todo, para cada request (Node.js runtime por defecto)      | No aplica (es único, en la raíz) |

**Route groups** `(auth)` y `(dashboard)`: agrupan rutas para compartir layout sin que el paréntesis aparezca en la URL real. `/employees` existe aunque el archivo viva en `app/(dashboard)/employees/page.tsx`.

**Segmentos dinámicos** `[id]`: capturan cualquier valor de la URL y lo pasan como prop a `page.tsx`. `app/(dashboard)/employees/[id]/page.tsx` responde a `/employees/123`, `/employees/456`, etc.

---

## 4. Las tres capas de seguridad

El frontend nunca es la única línea de defensa — es defensa en profundidad, igual que la base de datos:

```
Request entra
   ↓
1. PROXY DE RUTA   → ¿hay sesión válida? (no conoce roles ni permisos)
   ↓
2. LAYOUT / PAGE   → ¿el permiso del JWT autoriza esta ruta? (server-side, vía requirePermission())
   ↓
3. RLS (Supabase)  → aunque se salte 1 y 2, ¿la query puede devolver estas filas?
```

| Capa                      | Responsabilidad                                                   | Dónde vive                                                      | Qué NO hace                                                     |
| ------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- |
| Proxy                     | Autenticación únicamente                                          | `proxy.ts` + `lib/supabase/proxy.ts`                            | No valida permisos ni roles                                     |
| Guard de ruta             | Autorización por permiso, antes de renderizar                     | `lib/auth/require-permission.ts`, llamado desde cada `page.tsx` | No oculta/muestra botones — eso es UI                           |
| RLS                       | Última línea, protege filas aunque alguien rodee la UI            | Base de datos (ver `SGRH_Supabase_Architecture.md`)             | No da feedback de UX — solo bloquea datos                       |
| `usePermisos()` (cliente) | Oculta/muestra elementos de UI dentro de una página ya autorizada | `hooks/usePermisos.ts`                                          | No es seguridad real — es UX. La seguridad ya pasó en la capa 2 |

**Regla mental**: el proxy decide si entras al edificio. El guard de ruta decide si entras a esa oficina. RLS decide qué archivos puedes tocar dentro de la oficina. `usePermisos()` decide qué botones ves en el escritorio.

Los strings de permisos usados en todas estas capas vienen **exclusivamente** de `lib/permissions/catalog.ts` — ningún módulo debe escribir un string de permiso a mano. Ver ese archivo para la lista vigente.

---

## 5. Convención dentro de cada módulo

| Carpeta       | Contiene                                                  | Regla                                                                                                                                 |
| ------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `actions/`    | Server Actions (`'use server'`)                           | Una función = una operación de negocio (`crear-empleado.ts`, `aprobar-ausencia.ts`). Nunca mezclar dos operaciones en un archivo      |
| `components/` | Todo lo visual del módulo                                 | Sin subdivisión por tipo (forms/tables) salvo que el módulo crezca mucho — entonces subdividir _dentro_ del módulo, no a nivel global |
| `hooks/`      | Hooks específicos de ese dominio (ej. `useNominaCalculo`) | Si un hook se reutiliza en 2+ módulos, sube a `src/hooks/`                                                                            |
| `types.ts`    | DTOs y view models que no vienen directo de la tabla      | No duplicar tipos de `database.types.ts` — importar y componer desde ahí                                                              |

---

## 6. Manejo de errores y estados de carga

`error.tsx` y `loading.tsx` se heredan jerárquicamente — no es necesario uno por cada módulo desde el día uno.

- `app/error.tsx` (raíz): único que lleva `<html>`/`<body>` propios, porque reemplaza al `layout.tsx` raíz si este falla.
- `app/(dashboard)/error.tsx` y `app/(dashboard)/loading.tsx`: cubren todo el dashboard con un único punto de mantenimiento.
- Un módulo gana su propio `error.tsx`/`loading.tsx` específico solo cuando su criticidad o tiempo de carga lo justifica (ej. cálculo de nómina), no por defecto.

---

## 7. Flujo de Trabajo para Crear un Módulo Nuevo

Cuando se debe agregar un nuevo dominio de negocio al proyecto (por ejemplo, `training`), se sigue una secuencia de pasos y toma de decisiones obligatorias. Este flujo garantiza la seguridad, consistencia de tipos y una estructura limpia en toda la aplicación:

### Paso 1: Sincronización del Modelo (Base de Datos)
Toda funcionalidad nace en el backend/base de datos.
1. La tabla correspondiente debe estar creada en Supabase, con el mecanismo de seguridad **RLS habilitado** y sus políticas de acceso configuradas.
2. Ejecuta el script de generación de tipos en la raíz de `srgh-app` para actualizar tu archivo de tipos estáticos:
   ```bash
   pnpm run supabase:types
   ```

### Paso 2: Configuración de Seguridad y Permisos
Los permisos deben alinearse entre la base de datos y la aplicación:
1. Asegura que los identificadores de permisos (ej. `training.ver`, `training.crear`) estén sembrados en tu base de datos de Supabase.
2. Registra estos mismos strings en el catálogo centralizado [catalog.ts](file:///c:/Users/herre/OneDrive/Documentos/Universidad/Tercer%20A%C3%B1o%201%C2%B0%20Ciclo/Ingenieria%20en%20sistema%20I/Celulares_Alex_Frontend/srgh-app/src/lib/permissions/catalog.ts) para evitar el uso de strings sueltos en el código:
   ```typescript
   export const Permiso = {
     TRAINING_VER: 'training.ver',
     TRAINING_CREAR: 'training.crear',
     // ...
   } as const
   ```

### Paso 3: Estructura de Carpetas del Módulo
Crea la estructura modular bajo la ruta `src/modules/<nombre_modulo>/`:
* **`types.ts`:** El "contrato de datos" del módulo. Define los esquemas Zod (tipados con `z.Schema<DatabaseInsert | DatabaseUpdate>`) y exporta sus tipos inferidos.
* **`actions/`:** Para Server Actions (`'use server'`) dedicadas a procesos de mutación y escritura de datos en el servidor.
* **`components/`:** Todo el árbol de componentes (tanto de servidor como cliente) específicos de este dominio.
* **`hooks/`:** Hooks de React que compartan lógica interna exclusiva del módulo.

### Paso 4: Toma de Decisión - Estrategia de Carga de Datos
Antes de construir los componentes, decide la arquitectura de carga de datos basándote en la necesidad del módulo:
* **¿Es una vista mayormente de lectura, listado simple, reporte o pantalla de cara al SEO?**
  👉 **Decisión:** Usar **React Server Components (RSC)**. Se consulta la API de Supabase directo en el servidor. Menos JavaScript enviado al navegador, carga inicial más rápida y mejor indexación.
* **¿Es un panel/dashboard altamente interactivo con filtros instantáneos en cliente, pestañas dinámicas o formularios de creación/edición frecuente?**
  👉 **Decisión:** Usar **TanStack Query** (React Query) en componentes cliente. Facilita las consultas asíncronas con caché compartida y permite mutaciones con actualizaciones optimistas.

### Paso 5: Creación del Routing y Guardias de Servidor
Crea la ruta correspondiente en la carpeta `src/app/(dashboard)/<nombre_modulo>/page.tsx`. Esta página debe ser una capa delgada encargada de:
1. **Verificación de Seguridad:** Ejecutar obligatoriamente `requirePermission` en el servidor antes de resolver cualquier carga:
   ```typescript
   await requirePermission(Permiso.TRAINING_VER)
   ```
2. **Carga y Ensamblado:**
   - Si elegiste **RSC**: Llama a la Server Action de carga en el servidor y pasa los datos al componente de presentación del módulo.
   - Si elegiste **TanStack Query**: Renderiza el componente contenedor cliente del módulo (el cual cargará los datos en el navegador).

### Paso 6: Integración con la Interfaz General (Navegación)
1. Agrega el nuevo enlace de navegación en el Sidebar principal.
2. Usa el hook `usePermisos` de React para ocultar/mostrar visualmente la opción del menú dependiendo de los privilegios del usuario autenticado:
   ```tsx
   const { tiene } = usePermisos()
   if (tiene(Permiso.TRAINING_VER)) {
     // Renderizar botón de acceso al módulo en el Sidebar
   }
   ```

### Paso 7: Manejo de Cargas y Errores Específicos
* Por defecto, la ruta heredará los comportamientos globales de `loading.tsx` y `error.tsx` definidos en la raíz del dashboard.
* Si el módulo maneja procesos pesados o requiere placeholders de carga personalizados, crea archivos `loading.tsx` y `error.tsx` propios dentro de `src/app/(dashboard)/<nombre_modulo>/` para mejorar la UX sin afectar a otras áreas del sistema.

---

## 8. Cómo agregar una funcionalidad a un módulo existente

Ejemplo: agregar "exportar a Excel" dentro de `payroll`.

```
☐ Si requiere lógica de servidor → src/modules/payroll/actions/exportar-excel.ts
☐ Si requiere UI nueva → src/modules/payroll/components/BotonExportarExcel.tsx
☐ Si requiere un permiso nuevo (ej. payroll.exportar) →
   agregar a lib/permissions/catalog.ts Y sembrarlo en Supabase primero
☐ Verificar el permiso server-side antes de ejecutar la acción de exportación,
   no solo ocultar el botón en el cliente
```

La regla general: **un permiso nuevo siempre nace en Supabase, nunca en el frontend.** El catálogo del frontend refleja la base de datos, no al revés.

---

## 9. Carga de Datos y Gestión de Estado (RSC vs. TanStack Query)

En SGRH, la carga de datos y la gestión de estados se manejan de manera híbrida para aprovechar la velocidad del servidor y la interactividad del cliente:

### React Server Components (RSC)
* **Cuándo usar:** Carga inicial de páginas, lectura de datos generales, vistas de reporte estáticas y pantallas donde el SEO o el tiempo de primer pintado sean críticos.
* **Cómo funciona:** La consulta a la base de datos se realiza directamente en el servidor utilizando el cliente de servidor de Supabase (`lib/supabase/server.ts`). Los componentes se renderizan a HTML en el servidor y se envían listos al cliente.
* **Ejemplo:** Tablas iniciales, páginas de detalles de lectura y layouts estructurales.

### TanStack Query (React Query)
* **Cuándo usar:** Vistas altamente interactivas del lado del cliente (`'use client'`), dashboards que requieran refresco constante en tiempo real, paginaciones avanzadas del cliente e interacciones que modifiquen datos (mutaciones).
* **Beneficios clave:**
  - **Actualizaciones optimistas:** Muestran el cambio en la interfaz inmediatamente en el cliente mientras la mutación se procesa y confirma en Supabase.
  - **Caché inteligente:** Comparte consultas entre componentes cliente de manera eficiente, evitando peticiones duplicadas y redundantes al backend.
  - **Revalidación al foco:** Sincroniza los datos automáticamente cuando el usuario vuelve a enfocar la pestaña del navegador.
* **Qué NO hacer:** No utilizarlo en Server Components ni para gestionar suscripciones de eventos en tiempo real nativos de Supabase (como `onAuthStateChange` o canales en tiempo real), los cuales deben manejarse con las APIs reactivas nativas de Supabase.

---

## 10. Validación de Formularios y Datos (Zod + React Hook Form)

Para la captura de entradas de usuario, SGRH adopta un estándar de validación robusto y con alto rendimiento de renderizado en el cliente:

* **Zod:** Utilizado para definir esquemas estáticos de validación, reglas de campos y mensajes de error específicos en español.
* **React Hook Form:** Utilizado para gestionar el estado de los inputs y el ciclo de vida del formulario de forma eficiente, evitando re-renders innecesarios.
* **@hookform/resolvers:** Conector oficial para acoplar la validación de Zod con React Hook Form de forma nativa.

### Reglas de Implementación y Organización:

1. **Ubicación única de esquemas:** Todo esquema de Zod destinado a validar entradas de un formulario de un módulo debe declararse y exportarse en el archivo `types.ts` del módulo correspondiente (ej: `src/modules/attendance/types.ts`).
2. **Inferencia de tipos:** No se deben duplicar tipos o interfaces TypeScript a mano. El tipo de datos del formulario debe inferirse directamente del esquema de Zod:
   ```typescript
   export type SolicitarAusenciaInput = z.infer<typeof solicitarAusenciaSchema>
   ```
3. **Sincronización con Supabase:** Los esquemas de Zod de inserción (`Insert`) o actualización (`Update`) deben tiparse estrictamente contra los tipos generados de Supabase (`Database['public']['Tables']['<tabla>']['Insert']`) usando la estructura `z.Schema<T>` para garantizar que cualquier cambio en la base de datos se propague al compilador de TypeScript.
4. **Validación doble (Cliente + Servidor):**
   - El esquema se usa en el **cliente** mediante el resolver de React Hook Form para dar feedback interactivo e inmediato de UX.
   - El mismo esquema **debe** usarse en el **servidor** (dentro de la Server Action o Endpoint) mediante `safeParse(payload)` para validar la integridad antes de escribir en Supabase.

---

## 11. Decisiones consolidadas

| #   | Decisión                                                                 | Por qué                                                                                                  |
| --- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| 1   | Organización por módulo de negocio, no por tipo técnico                  | Menos conflictos de merge en equipo; mapea 1:1 con Stories de Jira                                       |
| 2   | `app/` solo enruta, lógica vive en `modules/`                            | Evita carpetas de `app/` infladas mezclando routing con lógica de negocio                                |
| 3   | Guard de permisos server-side (`requirePermission`), no solo cliente     | El HTML/datos nunca se envían si no hay permiso — `usePermisos()` por sí solo no lo garantiza            |
| 4   | `usePermisos()` solo para UX, nunca como única defensa                   | La seguridad real ya se resolvió en el server antes del render                                           |
| 5   | Catálogo central de permisos (`catalog.ts`)                              | Evita strings de permiso sueltos sin fuente única de verdad; permisos nuevos se agregan en un solo lugar |
| 6   | Proxy sin lógica de roles                                                | Mezclar lógica de autorización en el Proxy complica el mantenimiento y rendimiento               |
| 7   | Tipos generados vía Supabase CLI, nunca a mano                           | Evita desincronización entre schema real y tipos de TypeScript                                           |
| 8   | `error.tsx`/`loading.tsx` jerárquicos, no uno por página desde el inicio | Menor costo de mantenimiento; se especializa solo donde la criticidad lo justifica                       |
| 9   | Carga de datos híbrida (RSC para lectura, TanStack Query para cliente/mutaciones) | Optimiza el rendimiento de la carga inicial (RSC) y ofrece una UX fluida mediante caché y estados optimistas (TanStack Query) |
| 10  | Validación centralizada y tipada en `types.ts` (Zod + React Hook Form) | Asegura validación idéntica en cliente y servidor, infiere tipos automáticamente y previene desalineación con Supabase |

---

## 12. Qué NO hacer

- No escribir lógica de negocio dentro de `app/**/page.tsx` más allá de obtener datos y ensamblar componentes.
- No escribir un string de permiso a mano (`'nomina.algo'`) fuera de `lib/permissions/catalog.ts`.
- No confiar únicamente en `usePermisos()` para proteger una ruta — siempre debe existir el guard server-side correspondiente.
- No editar `types/database.types.ts` manualmente — se regenera con el CLI de Supabase.
- No crear un permiso nuevo en el frontend sin que exista primero en la tabla de permisos de Supabase.
- No mezclar componentes de dos módulos distintos en la misma carpeta de `modules/` "para no duplicar" — la duplicación pequeña entre módulos es preferible al acoplamiento cruzado.

---

## 13. Roadmap de crecimiento

Orden sugerido de expansión, alineado con los sprints de Jira ya definidos:

```
Sprint 1 (actual) — Base
  ✅ Scaffold Next.js + estructura de carpetas
  ✅ Clientes Supabase + proxy de sesión
  ✅ Capas de error/loading + página no-autorizado
  ✅ Catálogo central de permisos
  ☐ Flujo de login / activación de cuenta ((auth))
  ☐ Layout de dashboard (sidebar + topbar condicionados por permisos)

Sprint 2+ — Módulos
  ☐ Employees (CRUD base, primer módulo — sienta el patrón a replicar)
  ☐ Attendance
  ☐ Payroll (requiere Server Actions con service_role — mayor cuidado de seguridad)
  ☐ Recruitment
  ☐ Evaluations
  ☐ Settings / administración de roles y catálogos

Transversal — cuando aplique
  ☐ Definición de librería de componentes UI (pendiente de wireframes)
  ☐ Husky + commitlint con soporte de prefijo Jira
  ☐ Validación de env vars con Zod
```

Cada módulo nuevo, al construirse, debería poder responder a la sección 7 de este documento sin necesidad de inventar una estructura distinta.

---

_Documentación del proyecto SGRH — Arquitectura Frontend_
_Última actualización: Junio 2026_
