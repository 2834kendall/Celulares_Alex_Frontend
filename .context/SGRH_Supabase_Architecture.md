# Arquitectura Supabase — SGRH

> Documentación técnica de la configuración de backend en Supabase.  
> Enfocada en decisiones de seguridad, rendimiento e idempotencia.  
> Stack: **Supabase (PostgreSQL + Auth + RLS) + Next.js (App Router)**

---

## Índice

1. [Visión general](#1-visión-general)
2. [Configuración Auth](#2-configuración-auth)
3. [JWT y Custom Claims](#3-jwt-y-custom-claims)
4. [Funciones auxiliares (Helpers)](#4-funciones-auxiliares-helpers)
5. [Sistema de permisos dinámico](#5-sistema-de-permisos-dinámico)
6. [Row Level Security — RLS](#6-row-level-security--rls)
7. [Policies por módulo](#7-policies-por-módulo)
8. [Decisiones de seguridad consolidadas](#8-decisiones-de-seguridad-consolidadas)
9. [Decisiones de rendimiento consolidadas](#9-decisiones-de-rendimiento-consolidadas)
10. [Script maestro idempotente](#10-script-maestro-idempotente)
11. [Checklist de recreación](#11-checklist-de-recreación)
12. [Consumo desde Next.js](#12-consumo-desde-nextjs)

---

## 1. Visión general

### Por qué Supabase como backend completo

Para un SGRH interno, Supabase reemplaza un backend NestJS tradicional con ventajas clave:

| Necesidad | NestJS | Supabase |
|---|---|---|
| API REST | Controllers manuales | PostgREST automático por tabla |
| Autenticación | JWT propio + Guards | Supabase Auth integrado |
| Autorización | Decoradores, pipes | RLS en la base de datos |
| Realtime | Socket.io | Supabase Realtime nativo |
| Storage | S3 / local | Supabase Storage |
| Lógica compleja | Services | PostgreSQL Functions + Server Actions |

La ventaja más importante: **la seguridad vive en la base de datos**. Aunque el frontend tenga un bug o alguien intercepte la `publishable key`, RLS garantiza que nunca verán datos de otra empresa.

### Cuándo sí usar Next.js Server Actions

- Cálculo de nómina (lógica CCSS, horas extra, cesantía)
- Envío de emails (invitaciones, comprobantes)
- Operaciones con `secret key` — nunca en el browser
- Generación de PDFs

> **Nota de nomenclatura**: Supabase migró su esquema de API keys. Las keys legacy (`anon`, formato JWT `eyJ...`) pasan a llamarse **publishable** (`sb_publishable_...`), y `service_role` pasa a llamarse **secret** (`sb_secret_...`). El comportamiento y los privilegios son los mismos; solo cambia el nombre y el formato del string. Las keys legacy seguirán funcionando hasta su deprecación a finales de 2026, pero este documento usa la nomenclatura nueva en todo el proyecto.

---

## 2. Configuración Auth

### Por qué Email/Password y no Google SSO

Un SGRH es un sistema interno. Los empleados no se registran solos; RRHH los crea e invita. Google SSO requiere cuenta Google corporativa, lo que no siempre aplica. El flujo correcto:

```
RRHH invita al empleado → supabase.auth.admin.inviteUserByEmail()
        ↓
Empleado recibe email con link de activación
        ↓
Empleado define su password en primer acceso
        ↓
Trigger crea automáticamente su fila en sgrh_usuarios
```

### Ligar auth.users con sgrh_usuarios

Supabase Auth maneja login y sesiones en `auth.users`. El sistema de negocio usa `sgrh_usuarios`. Se conectan con una columna `uuid`:

```sql
ALTER TABLE public.sgrh_usuarios
ADD COLUMN usr_auth_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;
```

**Por qué `ON DELETE SET NULL` y no `CASCADE`**: Si se elimina el usuario de Auth (baja definitiva), el historial laboral y nómina del empleado debe conservarse por razones legales. `CASCADE` borraría todo.

### Trigger de auto-creación

Al registrarse en Auth, automáticamente se crea la fila en `sgrh_usuarios`:

```sql
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.sgrh_usuarios (usr_auth_id, usr_email, usr_password_hash, usr_activo)
  VALUES (NEW.id, NEW.email, '', true)
  ON CONFLICT (usr_email) DO UPDATE
  SET usr_auth_id = EXCLUDED.usr_auth_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
```

**Por qué `SECURITY DEFINER`**: El trigger corre en contexto de `auth.users`. Sin este modificador no tiene acceso al schema `public`.

**Por qué `SET search_path = public`**: Sin esto, un atacante podría crear objetos en otro schema con el mismo nombre para redirigir la ejecución. Supabase reporta esto como warning de seguridad si falta. **Aplica a todas las funciones del sistema.**

**Por qué `DROP TRIGGER IF EXISTS` antes de `CREATE`**: Idempotencia. Sin esto, correr el script dos veces falla con "trigger ya existe", bloqueando pipelines CI/CD o re-ejecuciones en producción.

### GRANTs para el hook de JWT

El hook corre con el rol `supabase_auth_admin`, que por defecto no tiene acceso a `public`. Sin estos grants, el hook falla silenciosamente y el JWT sale sin claims:

```sql
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT SELECT ON public.sgrh_usuarios             TO supabase_auth_admin;
GRANT SELECT ON public.sgrh_usuarios_empresa_rol TO supabase_auth_admin;
GRANT SELECT ON public.sgrh_cat_roles            TO supabase_auth_admin;
GRANT SELECT ON public.sgrh_rol_permisos         TO supabase_auth_admin;
GRANT SELECT ON public.sgrh_cat_permisos         TO supabase_auth_admin;
```

### Activar el hook en el Dashboard

```
Authentication → Hooks → Custom Access Token Hook
→ Schema: public
→ Function: custom_access_token_hook
→ Save
```

---

## 3. JWT y Custom Claims

### Por qué inyectar claims en el JWT

Por defecto el JWT solo tiene el `uuid` de `auth.users`. RLS necesita saber el rol, empresa y empleado del usuario en **cada query**. Las alternativas:

| Opción | Problema |
|---|---|
| Query a DB en cada request | Latencia extra en cada operación |
| Estado en el frontend | Inseguro, manipulable por el usuario |
| **Claims en el JWT** | ✅ Firmado criptográficamente, sin queries extra |

### Por qué incluir `emp_id` en el JWT

Decisión de rendimiento crítica. Sin `emp_id` en el token, cada policy que necesita saber "de qué empleado es este registro" ejecuta un subquery anidado:

```sql
-- ❌ Sin emp_id en JWT: triple subquery por cada fila evaluada
WHERE lab_empleado_id IN (
  SELECT usr_empleado_id FROM public.sgrh_usuarios
  WHERE usr_id IN (
    SELECT ... FROM ...  -- otro subquery para obtener usr_id
  )
)

-- ✅ Con emp_id en JWT: comparación directa en memoria
WHERE lab_empleado_id = public.get_emp_id()
```

En tablas de alta volatilidad como `sgrh_marcas_asistencia` (miles de registros), la diferencia es significativa.

### Por qué incluir `permisos` en el JWT

El array de permisos en el token permite al frontend tomar decisiones de UI sin queries adicionales. También permite que `tiene_permiso()` opere leyendo el token en memoria en lugar de hacer JOINs a la DB en cada policy.

> **Importante**: Los permisos en el JWT se generan al momento del login. Si se cambian permisos a un rol en la DB, el usuario debe hacer logout/login para obtener el token actualizado. Para un SGRH esto es aceptable.

### Función del hook

```sql
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb AS $$
DECLARE
  claims         jsonb;
  v_app_metadata jsonb;
  v_rol          text;
  v_empresa      int;
  v_usr_id       int;
  v_emp_id       int;
  v_permisos     text[];
  v_user_id_raw  text;
BEGIN
  -- 1. Asegurar que event no sea nulo
  IF event IS NULL THEN
    RETURN '{"claims":{}}'::jsonb;
  END IF;

  -- 2. Asegurar que event->'claims' sea siempre un objeto JSON válido (nunca null ni escalar)
  IF event->'claims' IS NULL OR jsonb_typeof(event->'claims') <> 'object' THEN
    event := jsonb_set(event, '{claims}', '{}'::jsonb);
  END IF;

  -- 3. Validar user_id de forma segura
  v_user_id_raw := event->>'user_id';
  IF v_user_id_raw IS NULL THEN
    RETURN event;
  END IF;

  -- 4. Bloque seguro para evitar caídas catastróficas en el login
  BEGIN
    -- Obtener usr_id y emp_id desde usr_auth_id
    SELECT usr_id, usr_empleado_id
    INTO v_usr_id, v_emp_id
    FROM public.sgrh_usuarios
    WHERE usr_auth_id = v_user_id_raw::uuid;

    -- Si el usuario no existe en la base de datos de negocio, retornar sin claims extras
    IF v_usr_id IS NULL THEN
      RETURN event;
    END IF;

    -- Rol y empresa activos del usuario
    SELECT r.rol_codigo, uer.uer_empresa_id
    INTO v_rol, v_empresa
    FROM public.sgrh_usuarios_empresa_rol uer
    JOIN public.sgrh_cat_roles r ON r.rol_id = uer.uer_rol_id
    WHERE uer.uer_usuario_id = v_usr_id
      AND uer.uer_activo = true
    LIMIT 1;

    -- Lista de códigos de permisos asignados al rol activo
    SELECT ARRAY_AGG(p.per_codigo)
    INTO v_permisos
    FROM public.sgrh_rol_permisos rp
    JOIN public.sgrh_cat_permisos p ON p.per_id = rp.rpe_permiso_id
    JOIN public.sgrh_cat_roles r    ON r.rol_id = rp.rpe_rol_id
    WHERE r.rol_codigo = v_rol;

    claims := event->'claims';
    
    -- Obtener app_metadata existente u objeto vacío
    v_app_metadata := coalesce(claims->'app_metadata', '{}'::jsonb);
    
    -- Guardar claims de negocio dentro de app_metadata para alineación con session.user en Next.js
    -- Se protege cada to_jsonb con coalesce para evitar que retorne NULL de base de datos (lo que anularía todo jsonb_set)
    v_app_metadata := jsonb_set(v_app_metadata, '{usr_id}',
                        coalesce(to_jsonb(v_usr_id), 'null'::jsonb));
    v_app_metadata := jsonb_set(v_app_metadata, '{emp_id}',
                        coalesce(to_jsonb(v_emp_id), 'null'::jsonb));
    v_app_metadata := jsonb_set(v_app_metadata, '{rol}',
                        to_jsonb(coalesce(v_rol, 'SIN_ROL')));
    v_app_metadata := jsonb_set(v_app_metadata, '{empresa_id}',
                        coalesce(to_jsonb(v_empresa), 'null'::jsonb));
    v_app_metadata := jsonb_set(v_app_metadata, '{permisos}',
                        to_jsonb(coalesce(v_permisos, '{}'::text[])));
    
    claims := jsonb_set(claims, '{app_metadata}', v_app_metadata);

    RETURN jsonb_set(event, '{claims}', claims);
  EXCEPTION WHEN OTHERS THEN
    -- En caso de error imprevisto, retornar el evento original intacto para no bloquear el inicio de sesión
    RETURN event;
  END;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public;
```

**Por qué `VOLATILE` y no `STABLE`**: Supabase requiere `VOLATILE` para funciones usadas como hooks de Auth.

### Contenido del JWT resultante

```json
{
  "sub": "uuid-auth-users",
  "email": "usuario@empresa.com",
  "app_metadata": {
    "provider": "email",
    "providers": ["email"],
    "usr_id": 5,
    "emp_id": 3,
    "rol": "RRHH",
    "empresa_id": 1,
    "permisos": ["EMPLEADOS_READ", "NOMINA_READ", "AUSENCIAS_APPROVE"]
  }
}
```

---

## 4. Funciones auxiliares (Helpers)

Leen los claims del JWT para usarlos en las policies. Viven en `public` porque Supabase no permite crear funciones en el schema `auth`.

```sql
CREATE OR REPLACE FUNCTION public.get_rol()
RETURNS text AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'rol');
$$ LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_empresa_id()
RETURNS int AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'empresa_id')::int;
$$ LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_usr_id()
RETURNS int AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'usr_id')::int;
$$ LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public;

-- Clave para rendimiento: emp_id directo del JWT sin subqueries
CREATE OR REPLACE FUNCTION public.get_emp_id()
RETURNS int AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'emp_id')::int;
$$ LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public;
```

**Por qué `STABLE`**: La función no modifica datos y retorna el mismo valor dentro de una transacción. PostgreSQL la cachea y la ejecuta una sola vez por query, no por fila.

### Revocar acceso público — decisión crítica de seguridad

En PostgreSQL, al crear una función se otorga `EXECUTE` a `PUBLIC` por defecto. Esto significa que cualquier usuario (incluso anónimo) puede llamar estas funciones vía /rest/v1/rpc/. El REVOKE debe hacerse sobre `PUBLIC`, no solo sobre `anon` y `authenticated`:

```sql
-- CRÍTICO: revocar de PUBLIC primero (el rol base que todos heredan)
-- Revocar solo de anon/authenticated no es suficiente porque heredan de PUBLIC
REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user()             FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb)    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_rol()                          FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_empresa_id()                   FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_usr_id()                       FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_emp_id()                       FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tiene_permiso(text)                FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION sgrh_private.asignar_permisos(text, text[])     FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable()                  FROM PUBLIC;

-- También explícitamente de anon y authenticated
REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user()             FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb)    FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_rol()                          FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_empresa_id()                   FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_usr_id()                       FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_emp_id()                       FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tiene_permiso(text)                FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION sgrh_private.asignar_permisos(text, text[])     FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable()                  FROM anon, authenticated;

-- Las policies RLS necesitan estos helpers para leer empresa, rol y permisos
GRANT EXECUTE ON FUNCTION public.get_rol()                           TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_empresa_id()                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_usr_id()                        TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_emp_id()                        TO authenticated;
GRANT EXECUTE ON FUNCTION public.tiene_permiso(text)                 TO authenticated;
```

**Por qué este GRANT es necesario**: las policies siguen ejecutándose con el rol `authenticated`, pero el acceso a la función se había revocado por completo. Sin devolverle `EXECUTE` a `authenticated`, cualquier policy que invoque `get_empresa_id()` o `tiene_permiso()` falla antes de evaluar filas.

**Por qué no se devuelve a `anon`**: estos helpers forman parte del flujo autenticado y no deben estar disponibles para usuarios anónimos.

---

## 5. Sistema de permisos dinámico

### El problema del rol hardcodeado

Si los roles se ponen directamente en las policies:
```sql
-- ❌ Requiere editar policies en producción cada vez que se crea un rol
USING (public.get_rol() IN ('ADMIN', 'RRHH'))
```

Agregar un rol nuevo requiere modificar decenas de policies en producción.

### La solución: permisos en base de datos + JWT

Las tablas `sgrh_cat_permisos`, `sgrh_cat_roles` y `sgrh_rol_permisos` gestionan qué rol tiene qué permisos. Las policies consultan el JWT (que ya trae los permisos) en lugar de comparar nombres de roles.

```sql
-- ✅ Funciona con cualquier rol que tenga el permiso, sin tocar policies
USING (public.tiene_permiso('EMPLEADOS_READ'))
```

### Función `tiene_permiso()` — optimizada para rendimiento

Lee directamente del JWT sin hacer queries a la DB:

```sql
CREATE OR REPLACE FUNCTION public.tiene_permiso(p_codigo text)
RETURNS boolean AS $$
  SELECT coalesce(
    (auth.jwt() -> 'app_metadata' -> 'permisos') @> to_jsonb(p_codigo),
    false
  );
$$ LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public;
```

**Comparación de rendimiento**:

| Versión | Operación por fila evaluada |
|---|---|
| Con JOINs a DB | 2 JOINs + query a sgrh_rol_permisos |
| **Con JWT** | Comparación en memoria (array lookup) |

### Catálogo de permisos del sistema

```sql
INSERT INTO public.sgrh_cat_permisos (per_codigo, per_modulo, per_nombre, per_descripcion) VALUES
-- empleados
('EMPLEADOS_READ',      'empleados',      'Ver empleados',           'Consultar listado y ficha'),
('EMPLEADOS_WRITE',     'empleados',      'Gestionar empleados',     'Crear y editar empleados'),
('HISTORIAL_READ',      'empleados',      'Ver historial laboral',   'Ver contratos y movimientos'),
('HISTORIAL_WRITE',     'empleados',      'Gestionar historial',     'Crear contratos, registrar salida'),
-- asistencia
('ASISTENCIA_READ',     'asistencia',     'Ver asistencia',          'Consultar marcas y programación'),
('ASISTENCIA_WRITE',    'asistencia',     'Registrar asistencia',    'Registrar entradas y salidas'),
('AUSENCIAS_READ',      'asistencia',     'Ver ausencias',           'Consultar ausencias'),
('AUSENCIAS_WRITE',     'asistencia',     'Solicitar ausencia',      'Crear solicitudes propias'),
('AUSENCIAS_APPROVE',   'asistencia',     'Aprobar ausencias',       'Aprobar o rechazar ausencias'),
-- nomina
('NOMINA_READ',         'nomina',         'Ver nómina',              'Consultar períodos y detalles'),
('NOMINA_WRITE',        'nomina',         'Procesar nómina',         'Crear y editar períodos'),
('NOMINA_APPROVE',      'nomina',         'Aprobar nómina',          'Cerrar y aprobar períodos'),
('COMPROBANTES_READ',   'nomina',         'Ver comprobantes',        'Ver comprobante de pago propio'),
-- reclutamiento
('RECLUTAMIENTO_READ',  'reclutamiento',  'Ver reclutamiento',       'Consultar candidatos'),
('RECLUTAMIENTO_WRITE', 'reclutamiento',  'Gestionar reclutamiento', 'Crear y gestionar postulaciones'),
-- evaluaciones
('EVALUACIONES_READ',   'evaluaciones',   'Ver evaluaciones',        'Consultar evaluaciones'),
('EVALUACIONES_WRITE',  'evaluaciones',   'Gestionar evaluaciones',  'Crear y editar evaluaciones'),
-- configuracion
('EMPRESAS_WRITE',      'configuracion',  'Configurar empresa',      'Editar datos de empresa'),
('CATALOGOS_WRITE',     'configuracion',  'Gestionar catálogos',     'Editar catálogos del sistema'),
('ROLES_WRITE',         'configuracion',  'Gestionar roles',         'Crear roles y asignar permisos'),
('USUARIOS_WRITE',      'configuracion',  'Gestionar usuarios',      'Crear e invitar usuarios'),
-- reportes
('REPORTES_READ',       'reportes',       'Ver reportes',            'Acceso a reportes y dashboards');
```

### Helper para asignar permisos a roles

```sql
-- Crear esquema para funciones privadas/administrativas no expuestas por PostgREST
CREATE SCHEMA IF NOT EXISTS sgrh_private;

CREATE OR REPLACE FUNCTION sgrh_private.asignar_permisos(p_rol_codigo text, p_permisos text[])
RETURNS void AS $$
  INSERT INTO public.sgrh_rol_permisos (rpe_rol_id, rpe_permiso_id)
  SELECT r.rol_id, p.per_id
  FROM public.sgrh_cat_roles r
  CROSS JOIN public.sgrh_cat_permisos p
  WHERE r.rol_codigo = p_rol_codigo
    AND p.per_codigo = ANY(p_permisos)
  ON CONFLICT DO NOTHING;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;
```

**Por qué `ON CONFLICT DO NOTHING`**: Idempotencia. Permite correr el seed de permisos múltiples veces sin errores.

### Roles base y sus permisos

```sql
INSERT INTO public.sgrh_cat_roles (rol_codigo, rol_nombre, rol_descripcion) VALUES
('ADMIN',      'Administrador',    'Acceso total al sistema'),
('RRHH',       'Recursos Humanos', 'Gestión de personal y nómina'),
('SUPERVISOR', 'Supervisor',       'Gestión de su equipo'),
('EMPLEADO',   'Empleado',         'Acceso a información propia')
ON CONFLICT (rol_codigo) DO NOTHING;

SELECT sgrh_private.asignar_permisos('ADMIN', ARRAY[
  'EMPLEADOS_READ','EMPLEADOS_WRITE','HISTORIAL_READ','HISTORIAL_WRITE',
  'ASISTENCIA_READ','ASISTENCIA_WRITE','AUSENCIAS_READ','AUSENCIAS_WRITE','AUSENCIAS_APPROVE',
  'NOMINA_READ','NOMINA_WRITE','NOMINA_APPROVE','COMPROBANTES_READ',
  'RECLUTAMIENTO_READ','RECLUTAMIENTO_WRITE','EVALUACIONES_READ','EVALUACIONES_WRITE',
  'EMPRESAS_WRITE','CATALOGOS_WRITE','ROLES_WRITE','USUARIOS_WRITE','REPORTES_READ'
]);

SELECT sgrh_private.asignar_permisos('RRHH', ARRAY[
  'EMPLEADOS_READ','EMPLEADOS_WRITE','HISTORIAL_READ','HISTORIAL_WRITE',
  'ASISTENCIA_READ','ASISTENCIA_WRITE','AUSENCIAS_READ','AUSENCIAS_WRITE','AUSENCIAS_APPROVE',
  'NOMINA_READ','NOMINA_WRITE','NOMINA_APPROVE','COMPROBANTES_READ',
  'RECLUTAMIENTO_READ','RECLUTAMIENTO_WRITE','EVALUACIONES_READ','EVALUACIONES_WRITE',
  'REPORTES_READ'
]);

SELECT sgrh_private.asignar_permisos('SUPERVISOR', ARRAY[
  'EMPLEADOS_READ','HISTORIAL_READ',
  'ASISTENCIA_READ','ASISTENCIA_WRITE',
  'AUSENCIAS_READ','AUSENCIAS_APPROVE',
  'EVALUACIONES_READ','EVALUACIONES_WRITE',
  'REPORTES_READ'
]);

SELECT sgrh_private.asignar_permisos('EMPLEADO', ARRAY[
  'ASISTENCIA_WRITE','AUSENCIAS_WRITE','COMPROBANTES_READ'
]);
```

### Agregar un rol nuevo en el futuro

```sql
-- Solo estas dos operaciones. Las policies NO cambian.
INSERT INTO sgrh_cat_roles (rol_codigo, rol_nombre)
VALUES ('GERENTE', 'Gerente Regional');

SELECT sgrh_private.asignar_permisos('GERENTE', ARRAY[
  'EMPLEADOS_READ', 'NOMINA_READ', 'REPORTES_READ'
]);
```

---

## 6. Row Level Security — RLS

### Qué es y por qué es la capa más importante

RLS aplica filtros automáticos a nivel de base de datos en cada query. No importa quién ejecute la query ni desde dónde: la DB siempre filtra.

```
Sin RLS:
  Browser → supabase-js → DB → retorna TODOS los datos
  (el frontend filtra, pero si alguien llama la API directamente?)

Con RLS:
  Browser → supabase-js → DB → RLS filtra → retorna SOLO los datos autorizados
  (imposible bypassear desde el cliente)
```

### Habilitar RLS — idempotente

```sql
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename LIKE 'sgrh_%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END;
$$;
```

### Limpieza de policies — idempotencia

Antes de crear policies, borrar las existentes. Permite re-ejecutar el script sin errores. El array de políticas contiene tanto las consolidadas heredadas como las nuevas atómicas:

```sql
DO $$
DECLARE
  t   text;
  pol text;
  policies text[] := ARRAY[
    -- Catálogos (Nuevas y Legadas)
    'cat_select','cat_write','cat_insert','cat_update','cat_delete',
    -- Empresas
    'empresas_select','empresas_write','empresas_insert','empresas_update','empresas_delete',
    -- Sucursales
    'sucursales_select','sucursales_write','sucursales_insert','sucursales_update','sucursales_delete',
    -- Usuarios
    'usuarios_select','usuarios_write','usuarios_insert','usuarios_update','usuarios_delete',
    -- Uer
    'uer_select','uer_write','uer_insert','uer_update','uer_delete',
    -- Horarios
    'horarios_select','horarios_write','horarios_insert','horarios_update','horarios_delete',
    -- Puestos
    'puestos_select','puestos_write','puestos_insert','puestos_update','puestos_delete',
    -- Niveles comisión
    'niveles_comision_select','niveles_comision_write','niveles_comision_insert','niveles_comision_update','niveles_comision_delete',
    -- Feriados
    'feriados_select','feriados_write','feriados_insert','feriados_update','feriados_delete',
    -- Empleados
    'empleados_select','empleados_write','empleados_insert','empleados_update','empleados_delete',
    -- Historial
    'historial_select','historial_write','historial_insert','historial_update','historial_delete',
    -- Marcas
    'marcas_select','marcas_insert','marcas_update','marcas_delete',
    -- Programación
    'programacion_select','programacion_write','programacion_insert','programacion_update','programacion_delete',
    -- Ausencias
    'ausencias_select','ausencias_insert','ausencias_update','ausencias_delete',
    -- Nómina Periodo
    'nomina_periodo_all','nomina_periodo_select','nomina_periodo_insert','nomina_periodo_update','nomina_periodo_delete',
    -- Nómina Detalle
    'nomina_detalle_select','nomina_detalle_write','nomina_detalle_insert','nomina_detalle_update','nomina_detalle_delete',
    -- Nómina Líneas (Ingreso/Deducción/Patronal)
    'nomina_lineas_ingreso','nomina_lineas_ingreso_select','nomina_lineas_ingreso_insert','nomina_lineas_ingreso_update','nomina_lineas_ingreso_delete',
    'nomina_lineas_deduccion','nomina_lineas_deduccion_select','nomina_lineas_deduccion_insert','nomina_lineas_deduccion_update','nomina_lineas_deduccion_delete',
    'nomina_lineas_patronal','nomina_lineas_patronal_select','nomina_lineas_patronal_insert','nomina_lineas_patronal_update','nomina_lineas_patronal_delete',
    -- Comprobantes
    'comprobantes_select','comprobantes_write','comprobantes_insert','comprobantes_update','comprobantes_delete',
    -- Beneficios
    'beneficios_all','beneficios_select','beneficios_insert','beneficios_update','beneficios_delete',
    -- Provisiones
    'provisiones_select','provisiones_write','provisiones_insert','provisiones_update','provisiones_delete',
    -- Comisiones
    'comisiones_all','comisiones_select','comisiones_insert','comisiones_update','comisiones_delete',
    -- Notificaciones
    'notificaciones_select','notificaciones_write','notificaciones_insert','notificaciones_update','notificaciones_delete',
    -- Candidatos
    'candidatos_all','candidatos_select','candidatos_insert','candidatos_update','candidatos_delete',
    -- Postulaciones
    'postulaciones_all','postulaciones_select','postulaciones_insert','postulaciones_update','postulaciones_delete',
    -- Postulación Etapas
    'postulacion_etapas_all','postulacion_etapas_select','postulacion_etapas_insert','postulacion_etapas_update','postulacion_etapas_delete',
    -- Evaluaciones
    'evaluaciones_select','evaluaciones_write','evaluaciones_insert','evaluaciones_update','evaluaciones_delete',
    -- Eval Resultados
    'eval_resultados_all','eval_resultados_select','eval_resultados_insert','eval_resultados_update','eval_resultados_delete'
  ];
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename LIKE 'sgrh_%'
  LOOP
    FOREACH pol IN ARRAY policies LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, t);
    END LOOP;
  END LOOP;
END;
$$;
```

---

## 7. Policies por módulo

### Principios aplicados en todas las policies

**1. Aislamiento multi-tenant obligatorio:** Toda policy operativa filtra por el `empresa_id` obtenido en memoria a través de `get_empresa_id()`.
**2. Separación INSERT / UPDATE / DELETE:** Evitamos políticas consolidadas `FOR ALL` en tablas de autoservicio o transaccionales para evitar escalación de privilegios, favoreciendo políticas atómicas y explícitas.
**3. Uso de subqueries para caching:** Envolvemos las funciones helpers (ej. `(SELECT public.get_empresa_id())`) para forzar al planificador de PostgreSQL a evaluar la función estable una única vez por consulta en lugar de re-evaluarla en cada fila.

---

### Catálogos Globales (Lectura autenticada, Escritura administrador)

Tablas de parametrización global del sistema que no contienen claves de inquilino.

```sql
-- Catálogos cubiertos por la policy dinámica:
-- sgrh_cat_areas_evaluacion, sgrh_cat_conceptos_nomina, sgrh_cat_criterios_evaluacion,
-- sgrh_cat_etapas_seleccion, sgrh_cat_motivos_salida, sgrh_cat_permisos, sgrh_cat_provincias,
-- sgrh_cat_cantones, sgrh_cat_distritos, sgrh_cat_roles, sgrh_cat_tipos_ausencia, 
-- sgrh_cat_tipos_contrato, sgrh_cat_tipos_identificacion, sgrh_cat_tipos_jornada, sgrh_rol_permisos

CREATE POLICY "cat_select" ON public.sgrh_cat_...
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "cat_insert" ON public.sgrh_cat_...
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.tiene_permiso('CATALOGOS_WRITE')));

CREATE POLICY "cat_update" ON public.sgrh_cat_...
  FOR UPDATE TO authenticated
  USING ((SELECT public.tiene_permiso('CATALOGOS_WRITE')))
  WITH CHECK ((SELECT public.tiene_permiso('CATALOGOS_WRITE')));

CREATE POLICY "cat_delete" ON public.sgrh_cat_...
  FOR DELETE TO authenticated USING ((SELECT public.tiene_permiso('CATALOGOS_WRITE')));
```

---

### Empresas y Sucursales

```sql
CREATE POLICY "empresas_select" ON public.sgrh_empresas
  FOR SELECT TO authenticated USING (org_id = (SELECT public.get_empresa_id()));

CREATE POLICY "empresas_insert" ON public.sgrh_empresas
  FOR INSERT TO authenticated WITH CHECK (org_id = (SELECT public.get_empresa_id()) AND (SELECT public.tiene_permiso('EMPRESAS_WRITE')));

CREATE POLICY "empresas_update" ON public.sgrh_empresas
  FOR UPDATE TO authenticated
  USING (org_id = (SELECT public.get_empresa_id()) AND (SELECT public.tiene_permiso('EMPRESAS_WRITE')))
  WITH CHECK (org_id = (SELECT public.get_empresa_id()) AND (SELECT public.tiene_permiso('EMPRESAS_WRITE')));

CREATE POLICY "empresas_delete" ON public.sgrh_empresas
  FOR DELETE TO authenticated USING (org_id = (SELECT public.get_empresa_id()) AND (SELECT public.tiene_permiso('EMPRESAS_WRITE')));

CREATE POLICY "sucursales_select" ON public.sgrh_sucursales
  FOR SELECT TO authenticated USING (suc_empresa_id = (SELECT public.get_empresa_id()));

CREATE POLICY "sucursales_insert" ON public.sgrh_sucursales
  FOR INSERT TO authenticated WITH CHECK (suc_empresa_id = (SELECT public.get_empresa_id()) AND (SELECT public.tiene_permiso('EMPRESAS_WRITE')));

CREATE POLICY "sucursales_update" ON public.sgrh_sucursales
  FOR UPDATE TO authenticated
  USING (suc_empresa_id = (SELECT public.get_empresa_id()) AND (SELECT public.tiene_permiso('EMPRESAS_WRITE')))
  WITH CHECK (suc_empresa_id = (SELECT public.get_empresa_id()) AND (SELECT public.tiene_permiso('EMPRESAS_WRITE')));

CREATE POLICY "sucursales_delete" ON public.sgrh_sucursales
  FOR DELETE TO authenticated USING (suc_empresa_id = (SELECT public.get_empresa_id()) AND (SELECT public.tiene_permiso('EMPRESAS_WRITE')));
```

---

### Usuarios y Permisos de Acceso

```sql
-- Usuarios (Perfiles de acceso)
CREATE POLICY "usuarios_select" ON public.sgrh_usuarios
  FOR SELECT TO authenticated USING (usr_auth_id = (SELECT auth.uid()) OR (SELECT public.tiene_permiso('USUARIOS_WRITE')));

CREATE POLICY "usuarios_insert" ON public.sgrh_usuarios
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.tiene_permiso('USUARIOS_WRITE')));

CREATE POLICY "usuarios_update" ON public.sgrh_usuarios
  FOR UPDATE TO authenticated
  USING (usr_auth_id = (SELECT auth.uid()) OR (SELECT public.tiene_permiso('USUARIOS_WRITE')))
  WITH CHECK (usr_auth_id = (SELECT auth.uid()) OR (SELECT public.tiene_permiso('USUARIOS_WRITE')));

CREATE POLICY "usuarios_delete" ON public.sgrh_usuarios
  FOR DELETE TO authenticated USING ((SELECT public.tiene_permiso('USUARIOS_WRITE')));

-- Usuarios Empresa Rol (Asociación Inquilino-Rol)
CREATE POLICY "uer_select" ON public.sgrh_usuarios_empresa_rol
  FOR SELECT TO authenticated
  USING (uer_usuario_id = (SELECT public.get_usr_id()) OR (SELECT public.tiene_permiso('USUARIOS_WRITE')) OR (SELECT public.tiene_permiso('ROLES_WRITE')));

CREATE POLICY "uer_insert" ON public.sgrh_usuarios_empresa_rol
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.tiene_permiso('USUARIOS_WRITE')) OR (SELECT public.tiene_permiso('ROLES_WRITE')));

CREATE POLICY "uer_update" ON public.sgrh_usuarios_empresa_rol
  FOR UPDATE TO authenticated
  USING ((SELECT public.tiene_permiso('USUARIOS_WRITE')) OR (SELECT public.tiene_permiso('ROLES_WRITE')))
  WITH CHECK ((SELECT public.tiene_permiso('USUARIOS_WRITE')) OR (SELECT public.tiene_permiso('ROLES_WRITE')));

CREATE POLICY "uer_delete" ON public.sgrh_usuarios_empresa_rol
  FOR DELETE TO authenticated USING ((SELECT public.tiene_permiso('USUARIOS_WRITE')) OR (SELECT public.tiene_permiso('ROLES_WRITE')));
```

---

### Empleados e Historial Laboral

```sql
-- Empleados (Ficha de datos)
CREATE POLICY "empleados_select" ON public.sgrh_empleados
  FOR SELECT TO authenticated
  USING (
    ((SELECT public.tiene_permiso('EMPLEADOS_READ')) AND emp_id IN (
      SELECT lab_empleado_id FROM public.sgrh_historial_laboral WHERE lab_empresa_id = (SELECT public.get_empresa_id())
    )) OR emp_id = (SELECT public.get_emp_id())
  );

CREATE POLICY "empleados_insert" ON public.sgrh_empleados
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.tiene_permiso('EMPLEADOS_WRITE')));

CREATE POLICY "empleados_update" ON public.sgrh_empleados
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.tiene_permiso('EMPLEADOS_WRITE')) AND emp_id IN (
      SELECT lab_empleado_id FROM public.sgrh_historial_laboral WHERE lab_empresa_id = (SELECT public.get_empresa_id())
    )
  )
  WITH CHECK (
    (SELECT public.tiene_permiso('EMPLEADOS_WRITE')) AND emp_id IN (
      SELECT lab_empleado_id FROM public.sgrh_historial_laboral WHERE lab_empresa_id = (SELECT public.get_empresa_id())
    )
  );

CREATE POLICY "empleados_delete" ON public.sgrh_empleados
  FOR DELETE TO authenticated
  USING (
    (SELECT public.tiene_permiso('EMPLEADOS_WRITE')) AND emp_id IN (
      SELECT lab_empleado_id FROM public.sgrh_historial_laboral WHERE lab_empresa_id = (SELECT public.get_empresa_id())
    )
  );

-- Historial Laboral (Contratos)
CREATE POLICY "historial_select" ON public.sgrh_historial_laboral
  FOR SELECT TO authenticated
  USING (
    lab_empleado_id = (SELECT public.get_emp_id()) OR
    (((SELECT public.tiene_permiso('HISTORIAL_READ')) OR (SELECT public.tiene_permiso('EMPLEADOS_READ'))) AND lab_empresa_id = (SELECT public.get_empresa_id()))
  );

CREATE POLICY "historial_insert" ON public.sgrh_historial_laboral
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.tiene_permiso('HISTORIAL_WRITE')) AND lab_empresa_id = (SELECT public.get_empresa_id()));

CREATE POLICY "historial_update" ON public.sgrh_historial_laboral
  FOR UPDATE TO authenticated
  USING ((SELECT public.tiene_permiso('HISTORIAL_WRITE')) AND lab_empresa_id = (SELECT public.get_empresa_id()))
  WITH CHECK ((SELECT public.tiene_permiso('HISTORIAL_WRITE')) AND lab_empresa_id = (SELECT public.get_empresa_id()));

CREATE POLICY "historial_delete" ON public.sgrh_historial_laboral
  FOR DELETE TO authenticated USING ((SELECT public.tiene_permiso('HISTORIAL_WRITE')) AND lab_empresa_id = (SELECT public.get_empresa_id()));
```

---

### Configuración Operativa Local

```sql
-- Horarios
CREATE POLICY "horarios_select" ON public.sgrh_cat_horarios
  FOR SELECT TO authenticated USING (hor_empresa_id = (SELECT public.get_empresa_id()));

CREATE POLICY "horarios_insert" ON public.sgrh_cat_horarios
  FOR INSERT TO authenticated WITH CHECK (hor_empresa_id = (SELECT public.get_empresa_id()) AND (SELECT public.tiene_permiso('CATALOGOS_WRITE')));

CREATE POLICY "horarios_update" ON public.sgrh_cat_horarios
  FOR UPDATE TO authenticated
  USING (hor_empresa_id = (SELECT public.get_empresa_id()) AND (SELECT public.tiene_permiso('CATALOGOS_WRITE')))
  WITH CHECK (hor_empresa_id = (SELECT public.get_empresa_id()) AND (SELECT public.tiene_permiso('CATALOGOS_WRITE')));

CREATE POLICY "horarios_delete" ON public.sgrh_cat_horarios
  FOR DELETE TO authenticated USING (hor_empresa_id = (SELECT public.get_empresa_id()) AND (SELECT public.tiene_permiso('CATALOGOS_WRITE')));

-- Puestos
CREATE POLICY "puestos_select" ON public.sgrh_cat_puestos
  FOR SELECT TO authenticated USING (pue_empresa_id = (SELECT public.get_empresa_id()));

CREATE POLICY "puestos_insert" ON public.sgrh_cat_puestos
  FOR INSERT TO authenticated WITH CHECK (pue_empresa_id = (SELECT public.get_empresa_id()) AND (SELECT public.tiene_permiso('CATALOGOS_WRITE')));

CREATE POLICY "puestos_update" ON public.sgrh_cat_puestos
  FOR UPDATE TO authenticated
  USING (pue_empresa_id = (SELECT public.get_empresa_id()) AND (SELECT public.tiene_permiso('CATALOGOS_WRITE')))
  WITH CHECK (pue_empresa_id = (SELECT public.get_empresa_id()) AND (SELECT public.tiene_permiso('CATALOGOS_WRITE')));

CREATE POLICY "puestos_delete" ON public.sgrh_cat_puestos
  FOR DELETE TO authenticated USING (pue_empresa_id = (SELECT public.get_empresa_id()) AND (SELECT public.tiene_permiso('CATALOGOS_WRITE')));

-- Niveles de Comisión
CREATE POLICY "niveles_comision_select" ON public.sgrh_cat_niveles_comision
  FOR SELECT TO authenticated USING (nvc_empresa_id = (SELECT public.get_empresa_id()));

CREATE POLICY "niveles_comision_insert" ON public.sgrh_cat_niveles_comision
  FOR INSERT TO authenticated WITH CHECK (nvc_empresa_id = (SELECT public.get_empresa_id()) AND (SELECT public.tiene_permiso('CATALOGOS_WRITE')));

CREATE POLICY "niveles_comision_update" ON public.sgrh_cat_niveles_comision
  FOR UPDATE TO authenticated
  USING (nvc_empresa_id = (SELECT public.get_empresa_id()) AND (SELECT public.tiene_permiso('CATALOGOS_WRITE')))
  WITH CHECK (nvc_empresa_id = (SELECT public.get_empresa_id()) AND (SELECT public.tiene_permiso('CATALOGOS_WRITE')));

CREATE POLICY "niveles_comision_delete" ON public.sgrh_cat_niveles_comision
  FOR DELETE TO authenticated USING (nvc_empresa_id = (SELECT public.get_empresa_id()) AND (SELECT public.tiene_permiso('CATALOGOS_WRITE')));

-- Feriados
CREATE POLICY "feriados_select" ON public.sgrh_cat_feriados
  FOR SELECT TO authenticated USING (fer_empresa_id IS NULL OR fer_empresa_id = (SELECT public.get_empresa_id()));

CREATE POLICY "feriados_insert" ON public.sgrh_cat_feriados
  FOR INSERT TO authenticated WITH CHECK ((fer_empresa_id IS NULL OR fer_empresa_id = (SELECT public.get_empresa_id())) AND (SELECT public.tiene_permiso('CATALOGOS_WRITE')));

CREATE POLICY "feriados_update" ON public.sgrh_cat_feriados
  FOR UPDATE TO authenticated
  USING ((fer_empresa_id IS NULL OR fer_empresa_id = (SELECT public.get_empresa_id())) AND (SELECT public.tiene_permiso('CATALOGOS_WRITE')))
  WITH CHECK ((fer_empresa_id IS NULL OR fer_empresa_id = (SELECT public.get_empresa_id())) AND (SELECT public.tiene_permiso('CATALOGOS_WRITE')));

CREATE POLICY "feriados_delete" ON public.sgrh_cat_feriados
  FOR DELETE TO authenticated USING ((fer_empresa_id IS NULL OR fer_empresa_id = (SELECT public.get_empresa_id())) AND (SELECT public.tiene_permiso('CATALOGOS_WRITE')));
```

---

### Asistencia y Calendario Semanal

```sql
-- Marcas de Asistencia
CREATE POLICY "marcas_select" ON public.sgrh_marcas_asistencia
  FOR SELECT TO authenticated
  USING (
    ((SELECT public.tiene_permiso('ASISTENCIA_READ')) AND mar_sucursal_id IN (
      SELECT suc_id FROM public.sgrh_sucursales WHERE suc_empresa_id = (SELECT public.get_empresa_id())
    )) OR mar_historial_laboral_id IN (
      SELECT lab_id FROM public.sgrh_historial_laboral WHERE lab_empleado_id = (SELECT public.get_emp_id())
    )
  );

CREATE POLICY "marcas_insert" ON public.sgrh_marcas_asistencia
  FOR INSERT TO authenticated
  WITH CHECK (
    (mar_historial_laboral_id IN (
      SELECT lab_id FROM public.sgrh_historial_laboral WHERE lab_empleado_id = (SELECT public.get_emp_id()) AND lab_empresa_id = (SELECT public.get_empresa_id())
    )) OR (SELECT public.tiene_permiso('ASISTENCIA_WRITE'))
  );

-- Programación Semanal
CREATE POLICY "programacion_select" ON public.sgrh_programacion_semanal
  FOR SELECT TO authenticated
  USING (
    prg_empleado_id = (SELECT public.get_emp_id()) OR
    ((SELECT public.tiene_permiso('ASISTENCIA_READ')) AND prg_sucursal_id IN (
      SELECT suc_id FROM public.sgrh_sucursales WHERE suc_empresa_id = (SELECT public.get_empresa_id())
    ))
  );

CREATE POLICY "programacion_insert" ON public.sgrh_programacion_semanal
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.tiene_permiso('ASISTENCIA_WRITE')) AND prg_sucursal_id IN (
    SELECT suc_id FROM public.sgrh_sucursales WHERE suc_empresa_id = (SELECT public.get_empresa_id())
  ));
```

---

### Ausencias

```sql
CREATE POLICY "ausencias_select" ON public.sgrh_ausencias
  FOR SELECT TO authenticated
  USING (
    ((SELECT public.tiene_permiso('AUSENCIAS_READ')) AND aus_historial_laboral_id IN (
      SELECT lab_id FROM public.sgrh_historial_laboral WHERE lab_empresa_id = (SELECT public.get_empresa_id())
    )) OR aus_historial_laboral_id IN (
      SELECT lab_id FROM public.sgrh_historial_laboral WHERE lab_empleado_id = (SELECT public.get_emp_id())
    )
  );

CREATE POLICY "ausencias_insert" ON public.sgrh_ausencias
  FOR INSERT TO authenticated
  WITH CHECK (
    (aus_historial_laboral_id IN (
      SELECT lab_id FROM public.sgrh_historial_laboral WHERE lab_empleado_id = (SELECT public.get_emp_id()) AND lab_empresa_id = (SELECT public.get_empresa_id())
    )) OR (SELECT public.tiene_permiso('AUSENCIAS_APPROVE'))
  );

CREATE POLICY "ausencias_update" ON public.sgrh_ausencias
  FOR UPDATE TO authenticated
  USING ((SELECT public.tiene_permiso('AUSENCIAS_APPROVE')) AND aus_historial_laboral_id IN (
    SELECT lab_id FROM public.sgrh_historial_laboral WHERE lab_empresa_id = (SELECT public.get_empresa_id())
  ))
  WITH CHECK ((SELECT public.tiene_permiso('AUSENCIAS_APPROVE')) AND aus_historial_laboral_id IN (
    SELECT lab_id FROM public.sgrh_historial_laboral WHERE lab_empresa_id = (SELECT public.get_empresa_id())
  ));
```

---

### Nómina, Líneas de Detalle y Comprobantes

```sql
-- Nómina Periodo
CREATE POLICY "nomina_periodo_select" ON public.sgrh_nomina_periodo
  FOR SELECT TO authenticated USING (npe_empresa_id = (SELECT public.get_empresa_id()) AND (SELECT public.tiene_permiso('NOMINA_READ')));

CREATE POLICY "nomina_periodo_insert" ON public.sgrh_nomina_periodo
  FOR INSERT TO authenticated WITH CHECK (npe_empresa_id = (SELECT public.get_empresa_id()) AND (SELECT public.tiene_permiso('NOMINA_WRITE')));

-- Nómina Detalle
CREATE POLICY "nomina_detalle_select" ON public.sgrh_nomina_detalle
  FOR SELECT TO authenticated
  USING (
    ((SELECT public.tiene_permiso('NOMINA_READ')) AND ndt_nomina_periodo_id IN (
      SELECT npe_id FROM public.sgrh_nomina_periodo WHERE npe_empresa_id = (SELECT public.get_empresa_id())
    )) OR ndt_historial_laboral_id IN (
      SELECT lab_id FROM public.sgrh_historial_laboral WHERE lab_empleado_id = (SELECT public.get_emp_id())
    )
  );

-- Comprobantes de Pago
CREATE POLICY "comprobantes_select" ON public.sgrh_comprobantes_pago
  FOR SELECT TO authenticated
  USING (
    com_nomina_detalle_id IN (
      SELECT ndt_id FROM public.sgrh_nomina_detalle WHERE ndt_historial_laboral_id IN (
        SELECT lab_id FROM public.sgrh_historial_laboral WHERE lab_empleado_id = (SELECT public.get_emp_id())
      )
    ) OR
    ((SELECT public.tiene_permiso('NOMINA_READ')) AND com_nomina_detalle_id IN (
      SELECT ndt_id FROM public.sgrh_nomina_detalle WHERE ndt_nomina_periodo_id IN (
        SELECT npe_id FROM public.sgrh_nomina_periodo WHERE npe_empresa_id = (SELECT public.get_empresa_id())
      )
    ))
  );

-- Líneas de Ingreso, Deducción y Patronales
CREATE POLICY "nomina_lineas_ingreso_select" ON public.sgrh_nomina_linea_ingreso
  FOR SELECT TO authenticated
  USING (
    ing_nomina_detalle_id IN (
      SELECT ndt_id FROM public.sgrh_nomina_detalle WHERE ndt_historial_laboral_id IN (
        SELECT lab_id FROM public.sgrh_historial_laboral WHERE lab_empleado_id = (SELECT public.get_emp_id())
      )
    ) OR
    ((SELECT public.tiene_permiso('NOMINA_READ')) AND ing_nomina_detalle_id IN (
      SELECT ndt_id FROM public.sgrh_nomina_detalle WHERE ndt_nomina_periodo_id IN (
        SELECT npe_id FROM public.sgrh_nomina_periodo WHERE npe_empresa_id = (SELECT public.get_empresa_id())
      )
    ))
  );
```

---

### Beneficios, Comisiones y Provisiones

```sql
-- Beneficios del Empleado
CREATE POLICY "beneficios_select" ON public.sgrh_beneficios_empleado
  FOR SELECT TO authenticated
  USING (
    ben_historial_laboral_id IN (
      SELECT lab_id FROM public.sgrh_historial_laboral WHERE lab_empleado_id = (SELECT public.get_emp_id())
    ) OR
    (((SELECT public.tiene_permiso('NOMINA_READ')) OR (SELECT public.tiene_permiso('EMPLEADOS_READ'))) AND ben_historial_laboral_id IN (
      SELECT lab_id FROM public.sgrh_historial_laboral WHERE lab_empresa_id = (SELECT public.get_empresa_id())
    ))
  );

-- Comisiones Calculadas
CREATE POLICY "comisiones_select" ON public.sgrh_comisiones_calculadas
  FOR SELECT TO authenticated
  USING (
    cal_historial_laboral_id IN (
      SELECT lab_id FROM public.sgrh_historial_laboral WHERE lab_empleado_id = (SELECT public.get_emp_id())
    ) OR
    ((SELECT public.tiene_permiso('NOMINA_READ')) AND cal_historial_laboral_id IN (
      SELECT lab_id FROM public.sgrh_historial_laboral WHERE lab_empresa_id = (SELECT public.get_empresa_id())
    ))
  );

-- Provisiones Anuales
CREATE POLICY "provisiones_select" ON public.sgrh_provisiones_anuales
  FOR SELECT TO authenticated
  USING (
    pra_historial_laboral_id IN (
      SELECT lab_id FROM public.sgrh_historial_laboral WHERE lab_empleado_id = (SELECT public.get_emp_id())
    ) OR
    ((SELECT public.tiene_permiso('NOMINA_READ')) AND pra_historial_laboral_id IN (
      SELECT lab_id FROM public.sgrh_historial_laboral WHERE lab_empresa_id = (SELECT public.get_empresa_id())
    ))
  );
```

---

### Reclutamiento y Selección

```sql
-- Candidatos
CREATE POLICY "candidatos_select" ON public.sgrh_candidatos
  FOR SELECT TO authenticated USING ((SELECT public.tiene_permiso('RECLUTAMIENTO_READ')));

-- Postulaciones
CREATE POLICY "postulaciones_select" ON public.sgrh_postulaciones
  FOR SELECT TO authenticated USING (pos_empresa_id = (SELECT public.get_empresa_id()) AND (SELECT public.tiene_permiso('RECLUTAMIENTO_READ')));

-- Postulación Etapas
CREATE POLICY "postulacion_etapas_select" ON public.sgrh_postulacion_etapas
  FOR SELECT TO authenticated
  USING (
    pet_postulacion_id IN (
      SELECT pos_id FROM public.sgrh_postulaciones WHERE pos_empresa_id = (SELECT public.get_empresa_id())
    ) AND (SELECT public.tiene_permiso('RECLUTAMIENTO_READ'))
  );
```

---

### Evaluaciones de Desempeño

```sql
-- Evaluaciones
CREATE POLICY "evaluaciones_select" ON public.sgrh_evaluaciones
  FOR SELECT TO authenticated
  USING (
    eve_empresa_id = (SELECT public.get_empresa_id()) AND
    ((SELECT public.tiene_permiso('EVALUACIONES_READ')) OR
     eve_evaluador_id = (SELECT public.get_usr_id()) OR
     eve_historial_laboral_id IN (
       SELECT lab_id FROM public.sgrh_historial_laboral WHERE lab_empleado_id = (SELECT public.get_emp_id())
     ))
  );

-- Resultados de Evaluación
CREATE POLICY "eval_resultados_select" ON public.sgrh_evaluacion_resultados
  FOR SELECT TO authenticated
  USING (
    evr_evaluacion_id IN (
      SELECT eve_id FROM public.sgrh_evaluaciones WHERE eve_empresa_id = (SELECT public.get_empresa_id()) AND
      ((SELECT public.tiene_permiso('EVALUACIONES_READ')) OR
       eve_evaluador_id = (SELECT public.get_usr_id()) OR
       eve_historial_laboral_id IN (
         SELECT lab_id FROM public.sgrh_historial_laboral WHERE lab_empleado_id = (SELECT public.get_emp_id())
       ))
    )
  );
```

---

### Notificaciones

```sql
CREATE POLICY "notificaciones_select" ON public.sgrh_notificaciones
  FOR SELECT TO authenticated
  USING (
    ntf_usuario_id = (SELECT public.get_usr_id()) OR
    ntf_empleado_id = (SELECT public.get_emp_id()) OR
    ((SELECT public.tiene_permiso('USUARIOS_WRITE')) AND ntf_empresa_id = (SELECT public.get_empresa_id()))
  );
```

---

## 8. Decisiones de seguridad consolidadas

| # | Decisión | Por qué |
|---|---|---|
| 1 | `SECURITY DEFINER` en triggers/hooks | Necesitan privilegios elevados que el rol de ejecución no tiene. |
| 2 | `SET search_path = public` en todas las funciones | Previene ataques de search_path injection. |
| 3 | `REVOKE EXECUTE FROM PUBLIC` (no solo anon/authenticated) | `anon` y `authenticated` heredan de `PUBLIC`; revocar solo de ellos no es suficiente. |
| 4 | `ON DELETE SET NULL` en `usr_auth_id` | Preserva historial laboral y nómina al dar de baja un usuario. |
| 5 | Separar `INSERT/UPDATE/DELETE` en tablas de autoservicio | `FOR ALL` daría UPDATE/DELETE globales a empleados que solo deben hacer INSERT de sus registros. |
| 6 | Filtro `empresa_id` en TODAS las policies operativas | Evita cross-tenant data leak donde RRHH de Empresa A ve datos de Empresa B. |
| 7 | Permisos basados en tabla, no en nombres de rol hardcodeados | Agregar roles nuevos no requiere tocar policies. |
| 8 | `VOLATILE` en el hook de Auth | Requerimiento de Supabase para hooks. |
| 9 | `SECURITY INVOKER` en funciones helpers | Al no requerir acceso a tablas directas sino solo leer del JWT, reduce el vector de ataque del superusuario. |
| 10| Cláusulas `WITH CHECK` en políticas `UPDATE` | Evita que un atacante reasigne IDs de empresas o empleados a registros fuera de su inquilino o propiedad durante las actualizaciones. |
| 11| Reubicación de funciones administrativas | Mover funciones administrativas como `asignar_permisos` a un esquema privado (`sgrh_private`) evita exponerlas públicamente vía PostgREST REST API. |

---

## 9. Decisiones de rendimiento consolidadas

| # | Decisión | Impacto |
|---|---|---|
| 1 | `emp_id` en el JWT | Elimina triple subquery por fila en tablas operativas. |
| 2 | `tiene_permiso()` lee del JWT | Elimina 2 JOINs a DB por cada evaluación de policy. |
| 3 | `STABLE` en helpers | PostgreSQL los cachea y ejecuta una vez por query, no por fila. |
| 4 | `get_emp_id()` como función `STABLE` | Una sola lectura del JWT por query, no por fila evaluada. |
| 5 | `ON CONFLICT DO NOTHING` en seeds | Permite re-ejecución sin necesidad de verificar existencia primero. |
| 6 | Envolver llamadas a funciones en `(SELECT ...)` dentro de policies | Fuerza a PostgreSQL a evaluar y cachear la función una sola vez por query en lugar de re-evaluarla por cada fila. |

---

## 10. Script maestro idempotente

El archivo `sgrh_rls_final.sql` contiene el script completo ejecutable múltiples veces sin errores. Incluye en orden:

```
1. Esquemas y limpieza de funciones desplazadas     — Crea sgrh_private y elimina la antigua public.asignar_permisos
2. Funciones base (hook, helpers, tiene_permiso)    — todas IDEMPOTENTES con CREATE OR REPLACE y SECURITY INVOKER
3. Trigger on_auth_user_created                     — DROP IF EXISTS antes de CREATE
4. GRANTs para supabase_auth_admin
5. REVOKEs de PUBLIC + anon + authenticated
6. Habilitar RLS en todas las tablas sgrh_*
7. Limpieza de policies anteriores                  — DROP POLICY IF EXISTS
8. Policies por módulo
```

---

## 11. Checklist de recreación

```
FASE 1 — Schema
☐ Ejecutar DDL completo
☐ Verificar tablas en Table Editor

FASE 2 — Auth setup
☐ Habilitar Email/Password en Authentication → Providers
☐ ALTER TABLE sgrh_usuarios ADD COLUMN usr_auth_id
☐ Ejecutar sgrh_rls_final.sql completo
☐ Activar hook: Authentication → Hooks → custom_access_token_hook

FASE 3 — Seed de catálogos
☐ sgrh_cat_tipos_identificacion  (CEDULA, DIMEX, PASAPORTE)
☐ sgrh_cat_provincias / cantones / distritos (CR completo)
☐ sgrh_cat_tipos_jornada         (DIURNA, NOCTURNA, MIXTA)
☐ sgrh_cat_tipos_contrato        (INDEFINIDO, PLAZO_FIJO, OBRA)
☐ sgrh_cat_motivos_salida
☐ sgrh_cat_tipos_ausencia
☐ sgrh_cat_etapas_seleccion
☐ sgrh_cat_areas_evaluacion + criterios
☐ sgrh_cat_conceptos_nomina      (SALARIO_BASE, CCSS, etc.)
☐ sgrh_cat_feriados              (año en curso)
☐ sgrh_cat_roles + asignar_permisos()

FASE 4 — Storage
☐ Bucket: logos-empresa   (público)
☐ Bucket: cv-candidatos   (privado)
☐ Bucket: documentos-ccss (privado)
☐ Bucket: comprobantes-pago (privado)

FASE 5 — Realtime
☐ ALTER PUBLICATION supabase_realtime ADD TABLE sgrh_notificaciones

FASE 6 — Usuario inicial
☐ Insertar empresa y sucursal base
☐ Invitar primer ADMIN vía supabase.auth.admin.inviteUserByEmail()
☐ Asignar rol en sgrh_usuarios_empresa_rol
```

---

## 12. Consumo desde Next.js

### Variables de entorno

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...   # segura en browser (RLS la protege)
SUPABASE_SECRET_KEY=sb_secret_...                          # NUNCA en browser — solo Server Actions
```

### Clientes

```typescript
// lib/supabase/client.ts — Client Components
import { createBrowserClient } from '@supabase/ssr'
export const createClient = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )

// lib/supabase/server.ts — Server Components y Server Actions
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
export const createServerSupabaseClient = () =>
  createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll: () => cookies().getAll() } }
  )
```

### Hook de permisos para UI

```typescript
// hooks/usePermisos.ts
import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import { Permisos } from '@/lib/permissions'

export function usePermisos() {
  const [permisos, setPermisos] = useState<string[]>([])
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setPermisos(session?.user?.app_metadata?.permisos ?? [])
    })
  }, [])

  const tiene = (permiso: string) => permisos.includes(permiso)
  return { permisos, tiene }
}

// Uso — la UI responde al token, la DB se protege sola con RLS
const { tiene } = usePermisos()
{tiene(Permisos.nomina.READ) && <ModuloNomina />}
```

### Enum de permisos para TypeScript

```typescript
// lib/permissions.ts
export const Permisos = {
  empleados: {
    READ:            'EMPLEADOS_READ',
    WRITE:           'EMPLEADOS_WRITE',
    HISTORIAL_READ:  'HISTORIAL_READ',
    HISTORIAL_WRITE: 'HISTORIAL_WRITE',
  },
  asistencia: {
    READ:              'ASISTENCIA_READ',
    WRITE:             'ASISTENCIA_WRITE',
    AUSENCIAS_READ:    'AUSENCIAS_READ',
    AUSENCIAS_WRITE:   'AUSENCIAS_WRITE',
    AUSENCIAS_APPROVE: 'AUSENCIAS_APPROVE',
  },
  nomina: {
    READ:             'NOMINA_READ',
    WRITE:            'NOMINA_WRITE',
    APPROVE:          'NOMINA_APPROVE',
    COMPROBANTES_READ:'COMPROBANTES_READ',
  },
  reclutamiento: {
    READ:  'RECLUTAMIENTO_READ',
    WRITE: 'RECLUTAMIENTO_WRITE',
  },
  evaluaciones: {
    READ:  'EVALUACIONES_READ',
    WRITE: 'EVALUACIONES_WRITE',
  },
  configuracion: {
    EMPRESAS_WRITE:  'EMPRESAS_WRITE',
    CATALOGOS_WRITE: 'CATALOGOS_WRITE',
    ROLES_WRITE:     'ROLES_WRITE',
    USUARIOS_WRITE:  'USUARIOS_WRITE',
  },
  reportes: {
    READ: 'REPORTES_READ',
  },
} as const

export type Permiso = typeof Permisos[keyof typeof Permisos][
  keyof typeof Permisos[keyof typeof Permisos]
]
```

### Server Action para operaciones sensibles

```typescript
// actions/nomina.ts
'use server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { Permisos } from '@/lib/permissions'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!  // nunca en el browser
)

export async function calcularNomina(periodoId: number) {
  const supabase = createServerSupabaseClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('No autorizado')

  const permisos: string[] = session.user.app_metadata?.permisos ?? []
  if (!permisos.includes(Permisos.nomina.WRITE)) throw new Error('Sin permiso')

  const { data, error } = await supabaseAdmin
    .rpc('calcular_nomina_periodo', { p_periodo_id: periodoId })

  if (error) throw error
  return data
}
```

---

*Documentación del proyecto SGRH — Configuración Supabase*  
*Última actualización: Junio 2026 — nomenclatura de API keys actualizada (publishable/secret)*
