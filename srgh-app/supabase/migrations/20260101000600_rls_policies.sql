-- =====================================================================
-- SGRH — Baseline: Row Level Security
-- =====================================================================
-- Tercera y última capa de seguridad del sistema (proxy/middleware →
-- requirePermission en Server Actions → RLS aquí). Es la única que no se
-- puede saltar desde el cliente, así que es la que realmente garantiza el
-- aislamiento multi-empresa.
--
-- Dos idioms que se repiten y no son cosméticos:
--   * (SELECT public.tiene_permiso('X')) — el SELECT envuelve la llamada
--     para que Postgres la evalúe UNA vez por query en vez de una vez por
--     fila. Sin él, una tabla con 10k filas hace 10k llamadas.
--   * La pertenencia a la empresa se resuelve vía sgrh_historial_laboral,
--     porque sgrh_empleados no tiene columna de empresa.
--
-- Todo el archivo es idempotente: la sección 2 borra las policies previas
-- antes de recrearlas.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. HABILITAR ROW LEVEL SECURITY (RLS)
-- ---------------------------------------------------------------------
-- Habilita RLS de forma dinámica en todas las tablas con prefijo sgrh_
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

-- ---------------------------------------------------------------------
-- 2. LIMPIEZA DE POLÍTICAS PREVIAS (Para Re-ejecución)
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 3. CREACIÓN DE NUEVAS POLÍTICAS OPTIMIZADAS
-- ---------------------------------------------------------------------

-- Catálogos Globales (Lectura autenticada, Escritura administrador)
DO $$
DECLARE
  t text;
  catalogos text[] := ARRAY[
    'sgrh_cat_areas_evaluacion','sgrh_cat_conceptos_nomina',
    'sgrh_cat_criterios_evaluacion','sgrh_cat_etapas_seleccion',
    'sgrh_cat_motivos_salida','sgrh_cat_permisos','sgrh_cat_provincias',
    'sgrh_cat_cantones','sgrh_cat_distritos','sgrh_cat_roles',
    'sgrh_cat_tipos_ausencia','sgrh_cat_tipos_contrato',
    'sgrh_cat_tipos_identificacion','sgrh_cat_tipos_jornada','sgrh_rol_permisos'
  ];
BEGIN
  FOREACH t IN ARRAY catalogos LOOP
    EXECUTE format(
      'CREATE POLICY "cat_select" ON public.%I
       FOR SELECT
       TO authenticated
       USING (true)', t);
    EXECUTE format(
      'CREATE POLICY "cat_insert" ON public.%I
       FOR INSERT
       TO authenticated
       WITH CHECK ((SELECT public.tiene_permiso(''CATALOGOS_WRITE'')))', t);
    EXECUTE format(
      'CREATE POLICY "cat_update" ON public.%I
       FOR UPDATE
       TO authenticated
       USING ((SELECT public.tiene_permiso(''CATALOGOS_WRITE'')))
       WITH CHECK ((SELECT public.tiene_permiso(''CATALOGOS_WRITE'')))', t);
    EXECUTE format(
      'CREATE POLICY "cat_delete" ON public.%I
       FOR DELETE
       TO authenticated
       USING ((SELECT public.tiene_permiso(''CATALOGOS_WRITE'')))', t);
  END LOOP;
END;
$$;

-- Empresas y Sucursales (Aislamiento tenant con wrapping para cache)
CREATE POLICY "empresas_select" ON public.sgrh_empresas FOR
SELECT TO authenticated USING (
        org_id = (
            SELECT public.get_empresa_id ()
        )
    );

CREATE POLICY "empresas_insert" ON public.sgrh_empresas FOR INSERT TO authenticated
WITH
    CHECK (
        org_id = (
            SELECT public.get_empresa_id ()
        )
        AND (
            SELECT public.tiene_permiso ('EMPRESAS_WRITE')
        )
    );

CREATE POLICY "empresas_update" ON public.sgrh_empresas
FOR UPDATE
    TO authenticated USING (
        org_id = (
            SELECT public.get_empresa_id ()
        )
        AND (
            SELECT public.tiene_permiso ('EMPRESAS_WRITE')
        )
    )
WITH
    CHECK (
        org_id = (
            SELECT public.get_empresa_id ()
        )
        AND (
            SELECT public.tiene_permiso ('EMPRESAS_WRITE')
        )
    );

CREATE POLICY "empresas_delete" ON public.sgrh_empresas FOR DELETE TO authenticated USING (
    org_id = (
        SELECT public.get_empresa_id ()
    )
    AND (
        SELECT public.tiene_permiso ('EMPRESAS_WRITE')
    )
);

CREATE POLICY "sucursales_select" ON public.sgrh_sucursales FOR
SELECT TO authenticated USING (
        suc_empresa_id = (
            SELECT public.get_empresa_id ()
        )
    );

CREATE POLICY "sucursales_insert" ON public.sgrh_sucursales FOR INSERT TO authenticated
WITH
    CHECK (
        suc_empresa_id = (
            SELECT public.get_empresa_id ()
        )
        AND (
            SELECT public.tiene_permiso ('EMPRESAS_WRITE')
        )
    );

CREATE POLICY "sucursales_update" ON public.sgrh_sucursales
FOR UPDATE
    TO authenticated USING (
        suc_empresa_id = (
            SELECT public.get_empresa_id ()
        )
        AND (
            SELECT public.tiene_permiso ('EMPRESAS_WRITE')
        )
    )
WITH
    CHECK (
        suc_empresa_id = (
            SELECT public.get_empresa_id ()
        )
        AND (
            SELECT public.tiene_permiso ('EMPRESAS_WRITE')
        )
    );

CREATE POLICY "sucursales_delete" ON public.sgrh_sucursales FOR DELETE TO authenticated USING (
    suc_empresa_id = (
        SELECT public.get_empresa_id ()
    )
    AND (
        SELECT public.tiene_permiso ('EMPRESAS_WRITE')
    )
);

-- Empleados (Lectura de sucursal/empresa o datos propios)
-- El expediente se lee a nivel EMPRESA, no sucursal, a propósito: una persona
-- no le pertenece a una sucursal, y un gerente necesita poder leer el nombre y
-- el contrato de alguien que fue trasladado para interpretar los registros que
-- esa persona dejó en su sucursal. El scoping por sucursal vive en las tablas
-- operativas, sobre el registro y no sobre la persona.
--
-- La excepción es el kiosco, que sí va acotado: ver la tercera rama.
CREATE POLICY "empleados_select" ON public.sgrh_empleados FOR
SELECT TO authenticated USING (
        -- 1. Lectura general del expediente, dentro de la empresa.
        (
            (
                SELECT public.tiene_permiso ('EMPLEADOS_READ')
            )
            AND emp_id IN (
                SELECT lab_empleado_id
                FROM public.sgrh_historial_laboral
                WHERE
                    lab_empresa_id = (
                        SELECT public.get_empresa_id ()
                    )
            )
        )
        -- 2. Autoservicio: el empleado siempre se ve a sí mismo.
        OR emp_id = (
            SELECT public.get_emp_id ()
        )
        -- 3. Kiosco: SOLO empleados con asignación ACTIVA en su propia
        --    sucursal. Es un dispositivo compartido y físicamente expuesto,
        --    así que no se le da la empresa entera ni el historial cerrado.
        OR (
            (
                SELECT public.tiene_permiso ('ASISTENCIA_KIOSCO')
            )
            AND emp_id IN (
                SELECT lab_empleado_id
                FROM public.sgrh_historial_laboral
                WHERE
                    lab_empresa_id = (
                        SELECT public.get_empresa_id ()
                    )
                    AND lab_fecha_fin IS NULL
                    AND (SELECT public.sucursal_visible (lab_sucursal_id))
            )
        )
    );

CREATE POLICY "empleados_insert" ON public.sgrh_empleados FOR INSERT TO authenticated
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('EMPLEADOS_WRITE')
        )
    );

CREATE POLICY "empleados_update" ON public.sgrh_empleados
FOR UPDATE
    TO authenticated USING (
        (
            SELECT public.tiene_permiso ('EMPLEADOS_WRITE')
        )
        AND emp_id IN (
            SELECT lab_empleado_id
            FROM public.sgrh_historial_laboral
            WHERE
                lab_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
        )
    )
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('EMPLEADOS_WRITE')
        )
        AND emp_id IN (
            SELECT lab_empleado_id
            FROM public.sgrh_historial_laboral
            WHERE
                lab_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
        )
    );

CREATE POLICY "empleados_delete" ON public.sgrh_empleados FOR DELETE TO authenticated USING (
    (
        SELECT public.tiene_permiso ('EMPLEADOS_WRITE')
    )
    AND emp_id IN (
        SELECT lab_empleado_id
        FROM public.sgrh_historial_laboral
        WHERE
            lab_empresa_id = (
                SELECT public.get_empresa_id ()
            )
    )
);

-- Ausencias (Operaciones segregadas y protección WITH CHECK)
CREATE POLICY "ausencias_select" ON public.sgrh_ausencias FOR
SELECT TO authenticated USING (
        (
            (
                SELECT public.tiene_permiso ('AUSENCIAS_READ')
            )
            AND aus_historial_laboral_id IN (
                SELECT lab_id
                FROM public.sgrh_historial_laboral
                WHERE
                    lab_empresa_id = (
                        SELECT public.get_empresa_id ()
                    )
                    AND (SELECT public.sucursal_visible (lab_sucursal_id))
            )
        )
        OR aus_historial_laboral_id IN (
            SELECT lab_id
            FROM public.sgrh_historial_laboral
            WHERE
                lab_empleado_id = (
                    SELECT public.get_emp_id ()
                )
        )
    );

-- Mismo arreglo que en marcas_insert: la rama de AUSENCIAS_APPROVE validaba
-- solo el permiso, así que permitía crear una ausencia contra el historial de
-- otra empresa. Ahora va acotada a empresa + sucursal visible.
CREATE POLICY "ausencias_insert" ON public.sgrh_ausencias FOR INSERT TO authenticated
WITH
    CHECK (
        -- 1. El empleado solicitando su propia ausencia (no necesita permiso:
        --    el rol EMPLEADO no tiene ninguno a propósito).
        (
            aus_historial_laboral_id IN (
                SELECT lab_id
                FROM public.sgrh_historial_laboral
                WHERE
                    lab_empleado_id = (
                        SELECT public.get_emp_id ()
                    )
                    AND lab_empresa_id = (
                        SELECT public.get_empresa_id ()
                    )
            )
        )
        -- 2. Quien aprueba, registrando por un empleado de su sucursal.
        OR (
            (
                SELECT public.tiene_permiso ('AUSENCIAS_APPROVE')
            )
            AND aus_historial_laboral_id IN (
                SELECT lab_id
                FROM public.sgrh_historial_laboral
                WHERE
                    lab_empresa_id = (
                        SELECT public.get_empresa_id ()
                    )
                    AND (SELECT public.sucursal_visible (lab_sucursal_id))
            )
        )
    );

CREATE POLICY "ausencias_update" ON public.sgrh_ausencias
FOR UPDATE
    TO authenticated USING (
        (
            SELECT public.tiene_permiso ('AUSENCIAS_APPROVE')
        )
        AND aus_historial_laboral_id IN (
            SELECT lab_id
            FROM public.sgrh_historial_laboral
            WHERE
                lab_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
                    AND (SELECT public.sucursal_visible (lab_sucursal_id))
        )
    )
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('AUSENCIAS_APPROVE')
        )
        AND aus_historial_laboral_id IN (
            SELECT lab_id
            FROM public.sgrh_historial_laboral
            WHERE
                lab_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
                    AND (SELECT public.sucursal_visible (lab_sucursal_id))
        )
    );

CREATE POLICY "ausencias_delete" ON public.sgrh_ausencias FOR DELETE TO authenticated USING (
    (
        SELECT public.tiene_permiso ('AUSENCIAS_APPROVE')
    )
    AND aus_historial_laboral_id IN (
        SELECT lab_id
        FROM public.sgrh_historial_laboral
        WHERE
            lab_empresa_id = (
                SELECT public.get_empresa_id ()
            )
                    AND (SELECT public.sucursal_visible (lab_sucursal_id))
    )
);

-- Marcas de asistencia (Aislamiento tenant y propiedad)
CREATE POLICY "marcas_select" ON public.sgrh_marcas_asistencia FOR
SELECT TO authenticated USING (
        (
            (
                SELECT public.tiene_permiso ('ASISTENCIA_READ')
            )
            AND (SELECT public.sucursal_visible(mar_sucursal_id))
        )
        OR mar_historial_laboral_id IN (
            SELECT lab_id
            FROM public.sgrh_historial_laboral
            WHERE
                lab_empleado_id = (
                    SELECT public.get_emp_id ()
                )
        )
    );

-- Dos caminos para registrar una marca, y los dos acotados al inquilino.
--
-- La rama de ASISTENCIA_WRITE antes NO validaba nada más que el permiso: se
-- podía insertar una marca contra el mar_historial_laboral_id de un empleado
-- de OTRA empresa llamando a PostgREST directo. Ahora exige que la marca caiga
-- en una sucursal visible y que el historial sea de la propia empresa.
CREATE POLICY "marcas_insert" ON public.sgrh_marcas_asistencia FOR INSERT TO authenticated
WITH
    CHECK (
        -- 1. El propio empleado marcando para sí mismo (no necesita permiso).
        (
            mar_historial_laboral_id IN (
                SELECT lab_id
                FROM public.sgrh_historial_laboral
                WHERE
                    lab_empleado_id = (
                        SELECT public.get_emp_id ()
                    )
                    AND lab_empresa_id = (
                        SELECT public.get_empresa_id ()
                    )
            )
        )
        -- 2. Kiosco o supervisor registrando por otro, dentro de su sucursal.
        OR (
            (
                SELECT public.tiene_permiso ('ASISTENCIA_WRITE')
            )
            AND (SELECT public.sucursal_visible (mar_sucursal_id))
            AND mar_historial_laboral_id IN (
                SELECT lab_id
                FROM public.sgrh_historial_laboral
                WHERE
                    lab_empresa_id = (
                        SELECT public.get_empresa_id ()
                    )
            )
        )
    );

CREATE POLICY "marcas_update" ON public.sgrh_marcas_asistencia
FOR UPDATE
    TO authenticated USING (
        (
            SELECT public.tiene_permiso ('ASISTENCIA_WRITE')
        )
        AND (SELECT public.sucursal_visible(mar_sucursal_id))
    )
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('ASISTENCIA_WRITE')
        )
        AND (SELECT public.sucursal_visible(mar_sucursal_id))
    );

CREATE POLICY "marcas_delete" ON public.sgrh_marcas_asistencia FOR DELETE TO authenticated USING (
    (
        SELECT public.tiene_permiso ('ASISTENCIA_WRITE')
    )
    AND (SELECT public.sucursal_visible(mar_sucursal_id))
);

-- Nómina Periodo (Segregando FOR ALL a políticas individuales)
CREATE POLICY "nomina_periodo_select" ON public.sgrh_nomina_periodo FOR
SELECT TO authenticated USING (
        npe_empresa_id = (
            SELECT public.get_empresa_id ()
        )
                    AND (SELECT public.sucursal_visible (npe_sucursal_id))
        AND (
            SELECT public.tiene_permiso ('NOMINA_READ')
        )
    );

CREATE POLICY "nomina_periodo_insert" ON public.sgrh_nomina_periodo FOR INSERT TO authenticated
WITH
    CHECK (
        npe_empresa_id = (
            SELECT public.get_empresa_id ()
        )
                    AND (SELECT public.sucursal_visible (npe_sucursal_id))
        AND (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
    );

CREATE POLICY "nomina_periodo_update" ON public.sgrh_nomina_periodo
FOR UPDATE
    TO authenticated USING (
        npe_empresa_id = (
            SELECT public.get_empresa_id ()
        )
                    AND (SELECT public.sucursal_visible (npe_sucursal_id))
        AND (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
    )
WITH
    CHECK (
        npe_empresa_id = (
            SELECT public.get_empresa_id ()
        )
                    AND (SELECT public.sucursal_visible (npe_sucursal_id))
        AND (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
    );

CREATE POLICY "nomina_periodo_delete" ON public.sgrh_nomina_periodo FOR DELETE TO authenticated USING (
    npe_empresa_id = (
        SELECT public.get_empresa_id ()
    )
                    AND (SELECT public.sucursal_visible (npe_sucursal_id))
    AND (
        SELECT public.tiene_permiso ('NOMINA_WRITE')
    )
);

-- Nómina Detalle
CREATE POLICY "nomina_detalle_select" ON public.sgrh_nomina_detalle FOR
SELECT TO authenticated USING (
        (
            (
                SELECT public.tiene_permiso ('NOMINA_READ')
            )
            AND ndt_nomina_periodo_id IN (
                SELECT npe_id
                FROM public.sgrh_nomina_periodo
                WHERE
                    npe_empresa_id = (
                        SELECT public.get_empresa_id ()
                    )
                    AND (SELECT public.sucursal_visible (npe_sucursal_id))
            )
        )
        OR ndt_historial_laboral_id IN (
            SELECT lab_id
            FROM public.sgrh_historial_laboral
            WHERE
                lab_empleado_id = (
                    SELECT public.get_emp_id ()
                )
        )
    );

CREATE POLICY "nomina_detalle_insert" ON public.sgrh_nomina_detalle FOR INSERT TO authenticated
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
        AND ndt_nomina_periodo_id IN (
            SELECT npe_id
            FROM public.sgrh_nomina_periodo
            WHERE
                npe_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
                    AND (SELECT public.sucursal_visible (npe_sucursal_id))
        )
    );

CREATE POLICY "nomina_detalle_update" ON public.sgrh_nomina_detalle
FOR UPDATE
    TO authenticated USING (
        (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
        AND ndt_nomina_periodo_id IN (
            SELECT npe_id
            FROM public.sgrh_nomina_periodo
            WHERE
                npe_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
                    AND (SELECT public.sucursal_visible (npe_sucursal_id))
        )
    )
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
        AND ndt_nomina_periodo_id IN (
            SELECT npe_id
            FROM public.sgrh_nomina_periodo
            WHERE
                npe_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
                    AND (SELECT public.sucursal_visible (npe_sucursal_id))
        )
    );

CREATE POLICY "nomina_detalle_delete" ON public.sgrh_nomina_detalle FOR DELETE TO authenticated USING (
    (
        SELECT public.tiene_permiso ('NOMINA_WRITE')
    )
    AND ndt_nomina_periodo_id IN (
        SELECT npe_id
        FROM public.sgrh_nomina_periodo
        WHERE
            npe_empresa_id = (
                SELECT public.get_empresa_id ()
            )
                    AND (SELECT public.sucursal_visible (npe_sucursal_id))
    )
);

-- ---------------------------------------------------------------------
-- MÓDULOS ADICIONALES (POLÍTICAS FALTANTES)
-- ---------------------------------------------------------------------

-- Usuarios (Perfiles de usuario)
CREATE POLICY "usuarios_select" ON public.sgrh_usuarios FOR
SELECT TO authenticated USING (
        usr_auth_id = (
            SELECT auth.uid ()
        )
        OR (
            SELECT public.tiene_permiso ('USUARIOS_WRITE')
        )
    );

CREATE POLICY "usuarios_insert" ON public.sgrh_usuarios FOR INSERT TO authenticated
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('USUARIOS_WRITE')
        )
    );

CREATE POLICY "usuarios_update" ON public.sgrh_usuarios
FOR UPDATE
    TO authenticated USING (
        usr_auth_id = (
            SELECT auth.uid ()
        )
        OR (
            SELECT public.tiene_permiso ('USUARIOS_WRITE')
        )
    )
WITH
    CHECK (
        usr_auth_id = (
            SELECT auth.uid ()
        )
        OR (
            SELECT public.tiene_permiso ('USUARIOS_WRITE')
        )
    );

CREATE POLICY "usuarios_delete" ON public.sgrh_usuarios FOR DELETE TO authenticated USING (
    (
        SELECT public.tiene_permiso ('USUARIOS_WRITE')
    )
);

-- Usuarios Empresa Rol (Asociación Tenant-Rol)
-- ─────────────────────────────────────────────────────────────────────
-- sgrh_usuarios_empresa_rol es la tabla que decide QUIÉN ES QUIÉN: una fila
-- acá es un rol efectivo en una empresa. Es la superficie de escalada de
-- privilegios del sistema, y por eso las cuatro policies exigen
-- uer_empresa_id = get_empresa_id() SIN excepción.
--
-- Sin ese chequeo (como estaba antes), cualquiera con USUARIOS_WRITE podía
-- insertarse una fila dándose el rol que quisiera en la empresa que quisiera
-- llamando a PostgREST directo. Las Server Actions sí filtraban, pero la RLS
-- es justamente la capa que no se puede saltar desde el cliente.
-- ─────────────────────────────────────────────────────────────────────
CREATE POLICY "uer_select" ON public.sgrh_usuarios_empresa_rol FOR
SELECT TO authenticated USING (
        -- El usuario siempre ve su propia asignación (la necesita para saber
        -- quién es); el resto solo dentro de su empresa.
        uer_usuario_id = (
            SELECT public.get_usr_id ()
        )
        OR (
            (
                (
                    SELECT public.tiene_permiso ('USUARIOS_WRITE')
                )
                OR (
                    SELECT public.tiene_permiso ('ROLES_WRITE')
                )
            )
            AND uer_empresa_id = (
                SELECT public.get_empresa_id ()
            )
        )
    );

CREATE POLICY "uer_insert" ON public.sgrh_usuarios_empresa_rol FOR INSERT TO authenticated
WITH
    CHECK (
        (
            (
                SELECT public.tiene_permiso ('USUARIOS_WRITE')
            )
            OR (
                SELECT public.tiene_permiso ('ROLES_WRITE')
            )
        )
        AND uer_empresa_id = (
            SELECT public.get_empresa_id ()
        )
        -- La sucursal, si viene, tiene que ser de la misma empresa. NULL es
        -- válido y significa "opera a nivel empresa" (ver get_sucursal_id).
        AND (
            uer_sucursal_id IS NULL
            OR (SELECT public.sucursal_visible (uer_sucursal_id))
        )
    );

-- USING acota qué filas se pueden tocar; WITH CHECK acota en qué se pueden
-- convertir. Las dos son necesarias: sin WITH CHECK se podría tomar una fila
-- propia y reescribirle uer_empresa_id apuntando a otra empresa.
CREATE POLICY "uer_update" ON public.sgrh_usuarios_empresa_rol
FOR UPDATE
    TO authenticated USING (
        (
            (
                SELECT public.tiene_permiso ('USUARIOS_WRITE')
            )
            OR (
                SELECT public.tiene_permiso ('ROLES_WRITE')
            )
        )
        AND uer_empresa_id = (
            SELECT public.get_empresa_id ()
        )
    )
WITH
    CHECK (
        (
            (
                SELECT public.tiene_permiso ('USUARIOS_WRITE')
            )
            OR (
                SELECT public.tiene_permiso ('ROLES_WRITE')
            )
        )
        AND uer_empresa_id = (
            SELECT public.get_empresa_id ()
        )
        AND (
            uer_sucursal_id IS NULL
            OR (SELECT public.sucursal_visible (uer_sucursal_id))
        )
    );

CREATE POLICY "uer_delete" ON public.sgrh_usuarios_empresa_rol FOR DELETE TO authenticated USING (
    (
        (
            SELECT public.tiene_permiso ('USUARIOS_WRITE')
        )
        OR (
            SELECT public.tiene_permiso ('ROLES_WRITE')
        )
    )
    AND uer_empresa_id = (
        SELECT public.get_empresa_id ()
    )
);

-- Historial Laboral
CREATE POLICY "historial_select" ON public.sgrh_historial_laboral FOR
SELECT TO authenticated USING (
        lab_empleado_id = (
            SELECT public.get_emp_id ()
        )
        OR (
            (
                (
                    SELECT public.tiene_permiso ('HISTORIAL_READ')
                )
                OR (
                    SELECT public.tiene_permiso ('EMPLEADOS_READ')
                )
            )
            AND lab_empresa_id = (
                SELECT public.get_empresa_id ()
            )
        )
    );

CREATE POLICY "historial_insert" ON public.sgrh_historial_laboral FOR INSERT TO authenticated
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('HISTORIAL_WRITE')
        )
        AND lab_empresa_id = (
            SELECT public.get_empresa_id ()
        )
    );

CREATE POLICY "historial_update" ON public.sgrh_historial_laboral
FOR UPDATE
    TO authenticated USING (
        (
            SELECT public.tiene_permiso ('HISTORIAL_WRITE')
        )
        AND lab_empresa_id = (
            SELECT public.get_empresa_id ()
        )
    )
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('HISTORIAL_WRITE')
        )
        AND lab_empresa_id = (
            SELECT public.get_empresa_id ()
        )
    );

CREATE POLICY "historial_delete" ON public.sgrh_historial_laboral FOR DELETE TO authenticated USING (
    (
        SELECT public.tiene_permiso ('HISTORIAL_WRITE')
    )
    AND lab_empresa_id = (
        SELECT public.get_empresa_id ()
    )
);

-- Horarios por Empresas
CREATE POLICY "horarios_select" ON public.sgrh_cat_horarios
  FOR SELECT
  TO authenticated
  USING (
    hor_empresa_id = (SELECT public.get_empresa_id())
    AND (SELECT public.tiene_permiso('HORARIOS_READ'))
  );

CREATE POLICY "horarios_insert" ON public.sgrh_cat_horarios
  FOR INSERT
  TO authenticated
  WITH CHECK (
    hor_empresa_id = (SELECT public.get_empresa_id())
    AND (SELECT public.tiene_permiso('HORARIOS_WRITE'))
  );

CREATE POLICY "horarios_update" ON public.sgrh_cat_horarios
  FOR UPDATE
  TO authenticated
  USING (
    hor_empresa_id = (SELECT public.get_empresa_id())
    AND (SELECT public.tiene_permiso('HORARIOS_WRITE'))
  )
  WITH CHECK (
    hor_empresa_id = (SELECT public.get_empresa_id())
    AND (SELECT public.tiene_permiso('HORARIOS_WRITE'))
  );

CREATE POLICY "horarios_delete" ON public.sgrh_cat_horarios
  FOR DELETE
  TO authenticated
  USING (
    hor_empresa_id = (SELECT public.get_empresa_id())
    AND (SELECT public.tiene_permiso('HORARIOS_WRITE'))
  );
-- Puestos por Empresa
CREATE POLICY "puestos_select" ON public.sgrh_cat_puestos FOR
SELECT TO authenticated USING (
        pue_empresa_id = (
            SELECT public.get_empresa_id ()
        )
    );

CREATE POLICY "puestos_insert" ON public.sgrh_cat_puestos FOR INSERT TO authenticated
WITH
    CHECK (
        pue_empresa_id = (
            SELECT public.get_empresa_id ()
        )
        AND (
            SELECT public.tiene_permiso ('CATALOGOS_WRITE')
        )
    );

CREATE POLICY "puestos_update" ON public.sgrh_cat_puestos
FOR UPDATE
    TO authenticated USING (
        pue_empresa_id = (
            SELECT public.get_empresa_id ()
        )
        AND (
            SELECT public.tiene_permiso ('CATALOGOS_WRITE')
        )
    )
WITH
    CHECK (
        pue_empresa_id = (
            SELECT public.get_empresa_id ()
        )
        AND (
            SELECT public.tiene_permiso ('CATALOGOS_WRITE')
        )
    );

CREATE POLICY "puestos_delete" ON public.sgrh_cat_puestos FOR DELETE TO authenticated USING (
    pue_empresa_id = (
        SELECT public.get_empresa_id ()
    )
    AND (
        SELECT public.tiene_permiso ('CATALOGOS_WRITE')
    )
);

-- Niveles de Comisión por Empresa
CREATE POLICY "niveles_comision_select" ON public.sgrh_cat_niveles_comision FOR
SELECT TO authenticated USING (
        nvc_empresa_id = (
            SELECT public.get_empresa_id ()
        )
    );

CREATE POLICY "niveles_comision_insert" ON public.sgrh_cat_niveles_comision FOR INSERT TO authenticated
WITH
    CHECK (
        nvc_empresa_id = (
            SELECT public.get_empresa_id ()
        )
        AND (
            SELECT public.tiene_permiso ('CATALOGOS_WRITE')
        )
    );

CREATE POLICY "niveles_comision_update" ON public.sgrh_cat_niveles_comision
FOR UPDATE
    TO authenticated USING (
        nvc_empresa_id = (
            SELECT public.get_empresa_id ()
        )
        AND (
            SELECT public.tiene_permiso ('CATALOGOS_WRITE')
        )
    )
WITH
    CHECK (
        nvc_empresa_id = (
            SELECT public.get_empresa_id ()
        )
        AND (
            SELECT public.tiene_permiso ('CATALOGOS_WRITE')
        )
    );

CREATE POLICY "niveles_comision_delete" ON public.sgrh_cat_niveles_comision FOR DELETE TO authenticated USING (
    nvc_empresa_id = (
        SELECT public.get_empresa_id ()
    )
    AND (
        SELECT public.tiene_permiso ('CATALOGOS_WRITE')
    )
);

-- Feriados
CREATE POLICY "feriados_select" ON public.sgrh_cat_feriados FOR
SELECT TO authenticated USING (
        fer_empresa_id IS NULL
        OR fer_empresa_id = (
            SELECT public.get_empresa_id ()
        )
    );

CREATE POLICY "feriados_insert" ON public.sgrh_cat_feriados FOR INSERT TO authenticated
WITH
    CHECK (
        (
            fer_empresa_id IS NULL
            OR fer_empresa_id = (
                SELECT public.get_empresa_id ()
            )
        )
        AND (
            SELECT public.tiene_permiso ('CATALOGOS_WRITE')
        )
    );

CREATE POLICY "feriados_update" ON public.sgrh_cat_feriados
FOR UPDATE
    TO authenticated USING (
        (
            fer_empresa_id IS NULL
            OR fer_empresa_id = (
                SELECT public.get_empresa_id ()
            )
        )
        AND (
            SELECT public.tiene_permiso ('CATALOGOS_WRITE')
        )
    )
WITH
    CHECK (
        (
            fer_empresa_id IS NULL
            OR fer_empresa_id = (
                SELECT public.get_empresa_id ()
            )
        )
        AND (
            SELECT public.tiene_permiso ('CATALOGOS_WRITE')
        )
    );

CREATE POLICY "feriados_delete" ON public.sgrh_cat_feriados FOR DELETE TO authenticated USING (
    (
        fer_empresa_id IS NULL
        OR fer_empresa_id = (
            SELECT public.get_empresa_id ()
        )
    )
    AND (
        SELECT public.tiene_permiso ('CATALOGOS_WRITE')
    )
);

-- Programación Semanal de Asistencia
CREATE POLICY "programacion_select" ON public.sgrh_programacion_semanal FOR
SELECT TO authenticated USING (
        prg_empleado_id = (
            SELECT public.get_emp_id ()
        )
        OR (
            (
                SELECT public.tiene_permiso ('ASISTENCIA_READ')
            )
            AND (SELECT public.sucursal_visible(prg_sucursal_id))
        )
    );

CREATE POLICY "programacion_insert" ON public.sgrh_programacion_semanal FOR INSERT TO authenticated
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('ASISTENCIA_WRITE')
        )
        AND (SELECT public.sucursal_visible(prg_sucursal_id))
    );

CREATE POLICY "programacion_update" ON public.sgrh_programacion_semanal
FOR UPDATE
    TO authenticated USING (
        (
            SELECT public.tiene_permiso ('ASISTENCIA_WRITE')
        )
        AND (SELECT public.sucursal_visible(prg_sucursal_id))
    )
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('ASISTENCIA_WRITE')
        )
        AND (SELECT public.sucursal_visible(prg_sucursal_id))
    );

CREATE POLICY "programacion_delete" ON public.sgrh_programacion_semanal FOR DELETE TO authenticated USING (
    (
        SELECT public.tiene_permiso ('ASISTENCIA_WRITE')
    )
    AND (SELECT public.sucursal_visible(prg_sucursal_id))
);

-- Comprobantes de Pago
CREATE POLICY "comprobantes_select" ON public.sgrh_comprobantes_pago FOR
SELECT TO authenticated USING (
        com_nomina_detalle_id IN (
            SELECT ndt_id
            FROM public.sgrh_nomina_detalle
            WHERE
                ndt_historial_laboral_id IN (
                    SELECT lab_id
                    FROM public.sgrh_historial_laboral
                    WHERE
                        lab_empleado_id = (
                            SELECT public.get_emp_id ()
                        )
                )
        )
        OR (
            (
                SELECT public.tiene_permiso ('NOMINA_READ')
            )
            AND com_nomina_detalle_id IN (
                SELECT ndt_id
                FROM public.sgrh_nomina_detalle
                WHERE
                    ndt_nomina_periodo_id IN (
                        SELECT npe_id
                        FROM public.sgrh_nomina_periodo
                        WHERE
                            npe_empresa_id = (
                                SELECT public.get_empresa_id ()
                            )
                    AND (SELECT public.sucursal_visible (npe_sucursal_id))
                    )
            )
        )
    );

CREATE POLICY "comprobantes_insert" ON public.sgrh_comprobantes_pago FOR INSERT TO authenticated
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
        AND com_nomina_detalle_id IN (
            SELECT ndt_id
            FROM public.sgrh_nomina_detalle
            WHERE
                ndt_nomina_periodo_id IN (
                    SELECT npe_id
                    FROM public.sgrh_nomina_periodo
                    WHERE
                        npe_empresa_id = (
                            SELECT public.get_empresa_id ()
                        )
                    AND (SELECT public.sucursal_visible (npe_sucursal_id))
                )
        )
    );

CREATE POLICY "comprobantes_update" ON public.sgrh_comprobantes_pago
FOR UPDATE
    TO authenticated USING (
        (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
        AND com_nomina_detalle_id IN (
            SELECT ndt_id
            FROM public.sgrh_nomina_detalle
            WHERE
                ndt_nomina_periodo_id IN (
                    SELECT npe_id
                    FROM public.sgrh_nomina_periodo
                    WHERE
                        npe_empresa_id = (
                            SELECT public.get_empresa_id ()
                        )
                    AND (SELECT public.sucursal_visible (npe_sucursal_id))
                )
        )
    )
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
        AND com_nomina_detalle_id IN (
            SELECT ndt_id
            FROM public.sgrh_nomina_detalle
            WHERE
                ndt_nomina_periodo_id IN (
                    SELECT npe_id
                    FROM public.sgrh_nomina_periodo
                    WHERE
                        npe_empresa_id = (
                            SELECT public.get_empresa_id ()
                        )
                    AND (SELECT public.sucursal_visible (npe_sucursal_id))
                )
        )
    );

CREATE POLICY "comprobantes_delete" ON public.sgrh_comprobantes_pago FOR DELETE TO authenticated USING (
    (
        SELECT public.tiene_permiso ('NOMINA_WRITE')
    )
    AND com_nomina_detalle_id IN (
        SELECT ndt_id
        FROM public.sgrh_nomina_detalle
        WHERE
            ndt_nomina_periodo_id IN (
                SELECT npe_id
                FROM public.sgrh_nomina_periodo
                WHERE
                    npe_empresa_id = (
                        SELECT public.get_empresa_id ()
                    )
                    AND (SELECT public.sucursal_visible (npe_sucursal_id))
            )
    )
);

-- Beneficios del Empleado
CREATE POLICY "beneficios_select" ON public.sgrh_beneficios_empleado FOR
SELECT TO authenticated USING (
        ben_historial_laboral_id IN (
            SELECT lab_id
            FROM public.sgrh_historial_laboral
            WHERE
                lab_empleado_id = (
                    SELECT public.get_emp_id ()
                )
        )
        OR (
            (
                (
                    SELECT public.tiene_permiso ('NOMINA_READ')
                )
                OR (
                    SELECT public.tiene_permiso ('EMPLEADOS_READ')
                )
            )
            AND ben_historial_laboral_id IN (
                SELECT lab_id
                FROM public.sgrh_historial_laboral
                WHERE
                    lab_empresa_id = (
                        SELECT public.get_empresa_id ()
                    )
            )
        )
    );

CREATE POLICY "beneficios_insert" ON public.sgrh_beneficios_empleado FOR INSERT TO authenticated
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
        AND ben_historial_laboral_id IN (
            SELECT lab_id
            FROM public.sgrh_historial_laboral
            WHERE
                lab_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
        )
    );

CREATE POLICY "beneficios_update" ON public.sgrh_beneficios_empleado
FOR UPDATE
    TO authenticated USING (
        (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
        AND ben_historial_laboral_id IN (
            SELECT lab_id
            FROM public.sgrh_historial_laboral
            WHERE
                lab_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
        )
    )
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
        AND ben_historial_laboral_id IN (
            SELECT lab_id
            FROM public.sgrh_historial_laboral
            WHERE
                lab_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
        )
    );

CREATE POLICY "beneficios_delete" ON public.sgrh_beneficios_empleado FOR DELETE TO authenticated USING (
    (
        SELECT public.tiene_permiso ('NOMINA_WRITE')
    )
    AND ben_historial_laboral_id IN (
        SELECT lab_id
        FROM public.sgrh_historial_laboral
        WHERE
            lab_empresa_id = (
                SELECT public.get_empresa_id ()
            )
    )
);

-- Comisiones Calculadas
CREATE POLICY "comisiones_select" ON public.sgrh_comisiones_calculadas FOR
SELECT TO authenticated USING (
        cal_historial_laboral_id IN (
            SELECT lab_id
            FROM public.sgrh_historial_laboral
            WHERE
                lab_empleado_id = (
                    SELECT public.get_emp_id ()
                )
        )
        OR (
            (
                SELECT public.tiene_permiso ('NOMINA_READ')
            )
            AND cal_historial_laboral_id IN (
                SELECT lab_id
                FROM public.sgrh_historial_laboral
                WHERE
                    lab_empresa_id = (
                        SELECT public.get_empresa_id ()
                    )
            )
        )
    );

CREATE POLICY "comisiones_insert" ON public.sgrh_comisiones_calculadas FOR INSERT TO authenticated
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
        AND cal_historial_laboral_id IN (
            SELECT lab_id
            FROM public.sgrh_historial_laboral
            WHERE
                lab_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
        )
    );

CREATE POLICY "comisiones_update" ON public.sgrh_comisiones_calculadas
FOR UPDATE
    TO authenticated USING (
        (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
        AND cal_historial_laboral_id IN (
            SELECT lab_id
            FROM public.sgrh_historial_laboral
            WHERE
                lab_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
        )
    )
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
        AND cal_historial_laboral_id IN (
            SELECT lab_id
            FROM public.sgrh_historial_laboral
            WHERE
                lab_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
        )
    );

CREATE POLICY "comisiones_delete" ON public.sgrh_comisiones_calculadas FOR DELETE TO authenticated USING (
    (
        SELECT public.tiene_permiso ('NOMINA_WRITE')
    )
    AND cal_historial_laboral_id IN (
        SELECT lab_id
        FROM public.sgrh_historial_laboral
        WHERE
            lab_empresa_id = (
                SELECT public.get_empresa_id ()
            )
    )
);

-- Provisiones Anuales
CREATE POLICY "provisiones_select" ON public.sgrh_provisiones_anuales FOR
SELECT TO authenticated USING (
        pra_historial_laboral_id IN (
            SELECT lab_id
            FROM public.sgrh_historial_laboral
            WHERE
                lab_empleado_id = (
                    SELECT public.get_emp_id ()
                )
        )
        OR (
            (
                SELECT public.tiene_permiso ('NOMINA_READ')
            )
            AND pra_historial_laboral_id IN (
                SELECT lab_id
                FROM public.sgrh_historial_laboral
                WHERE
                    lab_empresa_id = (
                        SELECT public.get_empresa_id ()
                    )
            )
        )
    );

CREATE POLICY "provisiones_insert" ON public.sgrh_provisiones_anuales FOR INSERT TO authenticated
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
        AND pra_historial_laboral_id IN (
            SELECT lab_id
            FROM public.sgrh_historial_laboral
            WHERE
                lab_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
        )
    );

CREATE POLICY "provisiones_update" ON public.sgrh_provisiones_anuales
FOR UPDATE
    TO authenticated USING (
        (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
        AND pra_historial_laboral_id IN (
            SELECT lab_id
            FROM public.sgrh_historial_laboral
            WHERE
                lab_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
        )
    )
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
        AND pra_historial_laboral_id IN (
            SELECT lab_id
            FROM public.sgrh_historial_laboral
            WHERE
                lab_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
        )
    );

CREATE POLICY "provisiones_delete" ON public.sgrh_provisiones_anuales FOR DELETE TO authenticated USING (
    (
        SELECT public.tiene_permiso ('NOMINA_WRITE')
    )
    AND pra_historial_laboral_id IN (
        SELECT lab_id
        FROM public.sgrh_historial_laboral
        WHERE
            lab_empresa_id = (
                SELECT public.get_empresa_id ()
            )
    )
);

-- Líneas de Nómina: Ingresos
CREATE POLICY "nomina_lineas_ingreso_select" ON public.sgrh_nomina_linea_ingreso FOR
SELECT TO authenticated USING (
        ing_nomina_detalle_id IN (
            SELECT ndt_id
            FROM public.sgrh_nomina_detalle
            WHERE
                ndt_historial_laboral_id IN (
                    SELECT lab_id
                    FROM public.sgrh_historial_laboral
                    WHERE
                        lab_empleado_id = (
                            SELECT public.get_emp_id ()
                        )
                )
        )
        OR (
            (
                SELECT public.tiene_permiso ('NOMINA_READ')
            )
            AND ing_nomina_detalle_id IN (
                SELECT ndt_id
                FROM public.sgrh_nomina_detalle
                WHERE
                    ndt_nomina_periodo_id IN (
                        SELECT npe_id
                        FROM public.sgrh_nomina_periodo
                        WHERE
                            npe_empresa_id = (
                                SELECT public.get_empresa_id ()
                            )
                    AND (SELECT public.sucursal_visible (npe_sucursal_id))
                    )
            )
        )
    );

CREATE POLICY "nomina_lineas_ingreso_insert" ON public.sgrh_nomina_linea_ingreso FOR INSERT TO authenticated
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
        AND ing_nomina_detalle_id IN (
            SELECT ndt_id
            FROM public.sgrh_nomina_detalle
            WHERE
                ndt_nomina_periodo_id IN (
                    SELECT npe_id
                    FROM public.sgrh_nomina_periodo
                    WHERE
                        npe_empresa_id = (
                            SELECT public.get_empresa_id ()
                        )
                    AND (SELECT public.sucursal_visible (npe_sucursal_id))
                )
        )
    );

CREATE POLICY "nomina_lineas_ingreso_update" ON public.sgrh_nomina_linea_ingreso
FOR UPDATE
    TO authenticated USING (
        (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
        AND ing_nomina_detalle_id IN (
            SELECT ndt_id
            FROM public.sgrh_nomina_detalle
            WHERE
                ndt_nomina_periodo_id IN (
                    SELECT npe_id
                    FROM public.sgrh_nomina_periodo
                    WHERE
                        npe_empresa_id = (
                            SELECT public.get_empresa_id ()
                        )
                    AND (SELECT public.sucursal_visible (npe_sucursal_id))
                )
        )
    )
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
        AND ing_nomina_detalle_id IN (
            SELECT ndt_id
            FROM public.sgrh_nomina_detalle
            WHERE
                ndt_nomina_periodo_id IN (
                    SELECT npe_id
                    FROM public.sgrh_nomina_periodo
                    WHERE
                        npe_empresa_id = (
                            SELECT public.get_empresa_id ()
                        )
                    AND (SELECT public.sucursal_visible (npe_sucursal_id))
                )
        )
    );

CREATE POLICY "nomina_lineas_ingreso_delete" ON public.sgrh_nomina_linea_ingreso FOR DELETE TO authenticated USING (
    (
        SELECT public.tiene_permiso ('NOMINA_WRITE')
    )
    AND ing_nomina_detalle_id IN (
        SELECT ndt_id
        FROM public.sgrh_nomina_detalle
        WHERE
            ndt_nomina_periodo_id IN (
                SELECT npe_id
                FROM public.sgrh_nomina_periodo
                WHERE
                    npe_empresa_id = (
                        SELECT public.get_empresa_id ()
                    )
                    AND (SELECT public.sucursal_visible (npe_sucursal_id))
            )
    )
);

-- Líneas de Nómina: Deducciones
CREATE POLICY "nomina_lineas_deduccion_select" ON public.sgrh_nomina_linea_deduccion FOR
SELECT TO authenticated USING (
        ded_nomina_detalle_id IN (
            SELECT ndt_id
            FROM public.sgrh_nomina_detalle
            WHERE
                ndt_historial_laboral_id IN (
                    SELECT lab_id
                    FROM public.sgrh_historial_laboral
                    WHERE
                        lab_empleado_id = (
                            SELECT public.get_emp_id ()
                        )
                )
        )
        OR (
            (
                SELECT public.tiene_permiso ('NOMINA_READ')
            )
            AND ded_nomina_detalle_id IN (
                SELECT ndt_id
                FROM public.sgrh_nomina_detalle
                WHERE
                    ndt_nomina_periodo_id IN (
                        SELECT npe_id
                        FROM public.sgrh_nomina_periodo
                        WHERE
                            npe_empresa_id = (
                                SELECT public.get_empresa_id ()
                            )
                    AND (SELECT public.sucursal_visible (npe_sucursal_id))
                    )
            )
        )
    );

CREATE POLICY "nomina_lineas_deduccion_insert" ON public.sgrh_nomina_linea_deduccion FOR INSERT TO authenticated
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
        AND ded_nomina_detalle_id IN (
            SELECT ndt_id
            FROM public.sgrh_nomina_detalle
            WHERE
                ndt_nomina_periodo_id IN (
                    SELECT npe_id
                    FROM public.sgrh_nomina_periodo
                    WHERE
                        npe_empresa_id = (
                            SELECT public.get_empresa_id ()
                        )
                    AND (SELECT public.sucursal_visible (npe_sucursal_id))
                )
        )
    );

CREATE POLICY "nomina_lineas_deduccion_update" ON public.sgrh_nomina_linea_deduccion
FOR UPDATE
    TO authenticated USING (
        (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
        AND ded_nomina_detalle_id IN (
            SELECT ndt_id
            FROM public.sgrh_nomina_detalle
            WHERE
                ndt_nomina_periodo_id IN (
                    SELECT npe_id
                    FROM public.sgrh_nomina_periodo
                    WHERE
                        npe_empresa_id = (
                            SELECT public.get_empresa_id ()
                        )
                    AND (SELECT public.sucursal_visible (npe_sucursal_id))
                )
        )
    )
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
        AND ded_nomina_detalle_id IN (
            SELECT ndt_id
            FROM public.sgrh_nomina_detalle
            WHERE
                ndt_nomina_periodo_id IN (
                    SELECT npe_id
                    FROM public.sgrh_nomina_periodo
                    WHERE
                        npe_empresa_id = (
                            SELECT public.get_empresa_id ()
                        )
                    AND (SELECT public.sucursal_visible (npe_sucursal_id))
                )
        )
    );

CREATE POLICY "nomina_lineas_deduccion_delete" ON public.sgrh_nomina_linea_deduccion FOR DELETE TO authenticated USING (
    (
        SELECT public.tiene_permiso ('NOMINA_WRITE')
    )
    AND ded_nomina_detalle_id IN (
        SELECT ndt_id
        FROM public.sgrh_nomina_detalle
        WHERE
            ndt_nomina_periodo_id IN (
                SELECT npe_id
                FROM public.sgrh_nomina_periodo
                WHERE
                    npe_empresa_id = (
                        SELECT public.get_empresa_id ()
                    )
                    AND (SELECT public.sucursal_visible (npe_sucursal_id))
            )
    )
);

-- Líneas de Nómina: Aportes Patronales
CREATE POLICY "nomina_lineas_patronal_select" ON public.sgrh_nomina_linea_patronal FOR
SELECT TO authenticated USING (
        pat_nomina_detalle_id IN (
            SELECT ndt_id
            FROM public.sgrh_nomina_detalle
            WHERE
                ndt_historial_laboral_id IN (
                    SELECT lab_id
                    FROM public.sgrh_historial_laboral
                    WHERE
                        lab_empleado_id = (
                            SELECT public.get_emp_id ()
                        )
                )
        )
        OR (
            (
                SELECT public.tiene_permiso ('NOMINA_READ')
            )
            AND pat_nomina_detalle_id IN (
                SELECT ndt_id
                FROM public.sgrh_nomina_detalle
                WHERE
                    ndt_nomina_periodo_id IN (
                        SELECT npe_id
                        FROM public.sgrh_nomina_periodo
                        WHERE
                            npe_empresa_id = (
                                SELECT public.get_empresa_id ()
                            )
                    AND (SELECT public.sucursal_visible (npe_sucursal_id))
                    )
            )
        )
    );

CREATE POLICY "nomina_lineas_patronal_insert" ON public.sgrh_nomina_linea_patronal FOR INSERT TO authenticated
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
        AND pat_nomina_detalle_id IN (
            SELECT ndt_id
            FROM public.sgrh_nomina_detalle
            WHERE
                ndt_nomina_periodo_id IN (
                    SELECT npe_id
                    FROM public.sgrh_nomina_periodo
                    WHERE
                        npe_empresa_id = (
                            SELECT public.get_empresa_id ()
                        )
                    AND (SELECT public.sucursal_visible (npe_sucursal_id))
                )
        )
    );

CREATE POLICY "nomina_lineas_patronal_update" ON public.sgrh_nomina_linea_patronal
FOR UPDATE
    TO authenticated USING (
        (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
        AND pat_nomina_detalle_id IN (
            SELECT ndt_id
            FROM public.sgrh_nomina_detalle
            WHERE
                ndt_nomina_periodo_id IN (
                    SELECT npe_id
                    FROM public.sgrh_nomina_periodo
                    WHERE
                        npe_empresa_id = (
                            SELECT public.get_empresa_id ()
                        )
                    AND (SELECT public.sucursal_visible (npe_sucursal_id))
                )
        )
    )
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
        AND pat_nomina_detalle_id IN (
            SELECT ndt_id
            FROM public.sgrh_nomina_detalle
            WHERE
                ndt_nomina_periodo_id IN (
                    SELECT npe_id
                    FROM public.sgrh_nomina_periodo
                    WHERE
                        npe_empresa_id = (
                            SELECT public.get_empresa_id ()
                        )
                    AND (SELECT public.sucursal_visible (npe_sucursal_id))
                )
        )
    );

CREATE POLICY "nomina_lineas_patronal_delete" ON public.sgrh_nomina_linea_patronal FOR DELETE TO authenticated USING (
    (
        SELECT public.tiene_permiso ('NOMINA_WRITE')
    )
    AND pat_nomina_detalle_id IN (
        SELECT ndt_id
        FROM public.sgrh_nomina_detalle
        WHERE
            ndt_nomina_periodo_id IN (
                SELECT npe_id
                FROM public.sgrh_nomina_periodo
                WHERE
                    npe_empresa_id = (
                        SELECT public.get_empresa_id ()
                    )
                    AND (SELECT public.sucursal_visible (npe_sucursal_id))
            )
    )
);

-- Candidatos
CREATE POLICY "candidatos_select" ON public.sgrh_candidatos FOR
SELECT TO authenticated USING (
        (
            SELECT public.tiene_permiso ('RECLUTAMIENTO_READ')
        )
    );

CREATE POLICY "candidatos_insert" ON public.sgrh_candidatos FOR INSERT TO authenticated
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('RECLUTAMIENTO_WRITE')
        )
    );

CREATE POLICY "candidatos_update" ON public.sgrh_candidatos
FOR UPDATE
    TO authenticated USING (
        (
            SELECT public.tiene_permiso ('RECLUTAMIENTO_WRITE')
        )
    )
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('RECLUTAMIENTO_WRITE')
        )
    );

CREATE POLICY "candidatos_delete" ON public.sgrh_candidatos FOR DELETE TO authenticated USING (
    (
        SELECT public.tiene_permiso ('RECLUTAMIENTO_WRITE')
    )
);

-- Postulaciones
CREATE POLICY "postulaciones_select" ON public.sgrh_postulaciones FOR
SELECT TO authenticated USING (
        pos_empresa_id = (
            SELECT public.get_empresa_id ()
        )
        AND (
            SELECT public.tiene_permiso ('RECLUTAMIENTO_READ')
        )
    );

CREATE POLICY "postulaciones_insert" ON public.sgrh_postulaciones FOR INSERT TO authenticated
WITH
    CHECK (
        pos_empresa_id = (
            SELECT public.get_empresa_id ()
        )
        AND (
            SELECT public.tiene_permiso ('RECLUTAMIENTO_WRITE')
        )
    );

CREATE POLICY "postulaciones_update" ON public.sgrh_postulaciones
FOR UPDATE
    TO authenticated USING (
        pos_empresa_id = (
            SELECT public.get_empresa_id ()
        )
        AND (
            SELECT public.tiene_permiso ('RECLUTAMIENTO_WRITE')
        )
    )
WITH
    CHECK (
        pos_empresa_id = (
            SELECT public.get_empresa_id ()
        )
        AND (
            SELECT public.tiene_permiso ('RECLUTAMIENTO_WRITE')
        )
    );

CREATE POLICY "postulaciones_delete" ON public.sgrh_postulaciones FOR DELETE TO authenticated USING (
    pos_empresa_id = (
        SELECT public.get_empresa_id ()
    )
    AND (
        SELECT public.tiene_permiso ('RECLUTAMIENTO_WRITE')
    )
);

-- Etapas de Postulación
CREATE POLICY "postulacion_etapas_select" ON public.sgrh_postulacion_etapas FOR
SELECT TO authenticated USING (
        pet_postulacion_id IN (
            SELECT pos_id
            FROM public.sgrh_postulaciones
            WHERE
                pos_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
        )
        AND (
            SELECT public.tiene_permiso ('RECLUTAMIENTO_READ')
        )
    );

CREATE POLICY "postulacion_etapas_insert" ON public.sgrh_postulacion_etapas FOR INSERT TO authenticated
WITH
    CHECK (
        pet_postulacion_id IN (
            SELECT pos_id
            FROM public.sgrh_postulaciones
            WHERE
                pos_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
        )
        AND (
            SELECT public.tiene_permiso ('RECLUTAMIENTO_WRITE')
        )
    );

CREATE POLICY "postulacion_etapas_update" ON public.sgrh_postulacion_etapas
FOR UPDATE
    TO authenticated USING (
        pet_postulacion_id IN (
            SELECT pos_id
            FROM public.sgrh_postulaciones
            WHERE
                pos_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
        )
        AND (
            SELECT public.tiene_permiso ('RECLUTAMIENTO_WRITE')
        )
    )
WITH
    CHECK (
        pet_postulacion_id IN (
            SELECT pos_id
            FROM public.sgrh_postulaciones
            WHERE
                pos_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
        )
        AND (
            SELECT public.tiene_permiso ('RECLUTAMIENTO_WRITE')
        )
    );

CREATE POLICY "postulacion_etapas_delete" ON public.sgrh_postulacion_etapas FOR DELETE TO authenticated USING (
    pet_postulacion_id IN (
        SELECT pos_id
        FROM public.sgrh_postulaciones
        WHERE
            pos_empresa_id = (
                SELECT public.get_empresa_id ()
            )
    )
    AND (
        SELECT public.tiene_permiso ('RECLUTAMIENTO_WRITE')
    )
);

-- Evaluaciones de Desempeño
CREATE POLICY "evaluaciones_select" ON public.sgrh_evaluaciones FOR
SELECT TO authenticated USING (
        eve_empresa_id = (
            SELECT public.get_empresa_id ()
        )
        AND (
            (
                SELECT public.tiene_permiso ('EVALUACIONES_READ')
            )
            OR eve_evaluador_id = (
                SELECT public.get_usr_id ()
            )
            OR eve_historial_laboral_id IN (
                SELECT lab_id
                FROM public.sgrh_historial_laboral
                WHERE
                    lab_empleado_id = (
                        SELECT public.get_emp_id ()
                    )
            )
        )
    );

CREATE POLICY "evaluaciones_insert" ON public.sgrh_evaluaciones FOR INSERT TO authenticated
WITH
    CHECK (
        eve_empresa_id = (
            SELECT public.get_empresa_id ()
        )
        AND (
            SELECT public.tiene_permiso ('EVALUACIONES_WRITE')
        )
    );

CREATE POLICY "evaluaciones_update" ON public.sgrh_evaluaciones
FOR UPDATE
    TO authenticated USING (
        eve_empresa_id = (
            SELECT public.get_empresa_id ()
        )
        AND (
            SELECT public.tiene_permiso ('EVALUACIONES_WRITE')
        )
    )
WITH
    CHECK (
        eve_empresa_id = (
            SELECT public.get_empresa_id ()
        )
        AND (
            SELECT public.tiene_permiso ('EVALUACIONES_WRITE')
        )
    );

CREATE POLICY "evaluaciones_delete" ON public.sgrh_evaluaciones FOR DELETE TO authenticated USING (
    eve_empresa_id = (
        SELECT public.get_empresa_id ()
    )
    AND (
        SELECT public.tiene_permiso ('EVALUACIONES_WRITE')
    )
);

-- Resultados de Evaluación
CREATE POLICY "eval_resultados_select" ON public.sgrh_evaluacion_resultados FOR
SELECT TO authenticated USING (
        evr_evaluacion_id IN (
            SELECT eve_id
            FROM public.sgrh_evaluaciones
            WHERE
                eve_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
                AND (
                    (
                        SELECT public.tiene_permiso ('EVALUACIONES_READ')
                    )
                    OR eve_evaluador_id = (
                        SELECT public.get_usr_id ()
                    )
                    OR eve_historial_laboral_id IN (
                        SELECT lab_id
                        FROM public.sgrh_historial_laboral
                        WHERE
                            lab_empleado_id = (
                                SELECT public.get_emp_id ()
                            )
                    )
                )
        )
    );

CREATE POLICY "eval_resultados_insert" ON public.sgrh_evaluacion_resultados FOR INSERT TO authenticated
WITH
    CHECK (
        evr_evaluacion_id IN (
            SELECT eve_id
            FROM public.sgrh_evaluaciones
            WHERE
                eve_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
        )
        AND (
            SELECT public.tiene_permiso ('EVALUACIONES_WRITE')
        )
    );

CREATE POLICY "eval_resultados_update" ON public.sgrh_evaluacion_resultados
FOR UPDATE
    TO authenticated USING (
        evr_evaluacion_id IN (
            SELECT eve_id
            FROM public.sgrh_evaluaciones
            WHERE
                eve_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
        )
        AND (
            SELECT public.tiene_permiso ('EVALUACIONES_WRITE')
        )
    )
WITH
    CHECK (
        evr_evaluacion_id IN (
            SELECT eve_id
            FROM public.sgrh_evaluaciones
            WHERE
                eve_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
        )
        AND (
            SELECT public.tiene_permiso ('EVALUACIONES_WRITE')
        )
    );

CREATE POLICY "eval_resultados_delete" ON public.sgrh_evaluacion_resultados FOR DELETE TO authenticated USING (
    evr_evaluacion_id IN (
        SELECT eve_id
        FROM public.sgrh_evaluaciones
        WHERE
            eve_empresa_id = (
                SELECT public.get_empresa_id ()
            )
    )
    AND (
        SELECT public.tiene_permiso ('EVALUACIONES_WRITE')
    )
);

-- Notificaciones
CREATE POLICY "notificaciones_select" ON public.sgrh_notificaciones FOR
SELECT TO authenticated USING (
        ntf_usuario_id = (
            SELECT public.get_usr_id ()
        )
        OR ntf_empleado_id = (
            SELECT public.get_emp_id ()
        )
        OR (
            (
                SELECT public.tiene_permiso ('USUARIOS_WRITE')
            )
            AND ntf_empresa_id = (
                SELECT public.get_empresa_id ()
            )
        )
    );

CREATE POLICY "notificaciones_insert" ON public.sgrh_notificaciones FOR INSERT TO authenticated
WITH
    CHECK (
        ntf_empresa_id = (
            SELECT public.get_empresa_id ()
        )
    );

CREATE POLICY "notificaciones_update" ON public.sgrh_notificaciones
FOR UPDATE
    TO authenticated USING (
        ntf_usuario_id = (
            SELECT public.get_usr_id ()
        )
        OR ntf_empleado_id = (
            SELECT public.get_emp_id ()
        )
    )
WITH
    CHECK (
        ntf_usuario_id = (
            SELECT public.get_usr_id ()
        )
        OR ntf_empleado_id = (
            SELECT public.get_emp_id ()
        )
    );

CREATE POLICY "notificaciones_delete" ON public.sgrh_notificaciones FOR DELETE TO authenticated USING (
    ntf_usuario_id = (
        SELECT public.get_usr_id ()
    )
    OR ntf_empleado_id = (
        SELECT public.get_emp_id ()
    )
);

-- ---------------------------------------------------------------------
-- 4. POLÍTICAS DE TABLAS AÑADIDAS DESPUÉS DEL DISEÑO ORIGINAL
-- ---------------------------------------------------------------------
-- Estas tablas nacieron en migraciones posteriores al script maestro, así
-- que sus policies vivían dispersas en cada una. Aquí quedan consolidadas.
--
-- Ojo con la sección 2: su DROP dinámico solo alcanza las policies creadas
-- en la sección 3, así que estas se recrean con su propio DROP explícito.

-- ─── sgrh_empleado_datos_pago ───────────────────────────────────────

DROP POLICY IF EXISTS "datos_pago_select" ON public.sgrh_empleado_datos_pago;
CREATE POLICY "datos_pago_select" ON public.sgrh_empleado_datos_pago
  FOR SELECT TO authenticated
  USING (
    edp_empleado_id = (SELECT public.get_emp_id()) OR
    (
      ((SELECT public.tiene_permiso('NOMINA_READ')) OR (SELECT public.tiene_permiso('EMPLEADOS_WRITE')))
      AND edp_empleado_id IN (
        SELECT lab_empleado_id FROM public.sgrh_historial_laboral
        WHERE lab_empresa_id = (SELECT public.get_empresa_id())
      )
    )
  );

DROP POLICY IF EXISTS "datos_pago_insert" ON public.sgrh_empleado_datos_pago;
CREATE POLICY "datos_pago_insert" ON public.sgrh_empleado_datos_pago
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.tiene_permiso('EMPLEADOS_WRITE')) AND edp_empleado_id IN (
      SELECT lab_empleado_id FROM public.sgrh_historial_laboral
      WHERE lab_empresa_id = (SELECT public.get_empresa_id())
    )
  );

DROP POLICY IF EXISTS "datos_pago_update" ON public.sgrh_empleado_datos_pago;
CREATE POLICY "datos_pago_update" ON public.sgrh_empleado_datos_pago
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.tiene_permiso('EMPLEADOS_WRITE')) AND edp_empleado_id IN (
      SELECT lab_empleado_id FROM public.sgrh_historial_laboral
      WHERE lab_empresa_id = (SELECT public.get_empresa_id())
    )
  )
  WITH CHECK (
    (SELECT public.tiene_permiso('EMPLEADOS_WRITE')) AND edp_empleado_id IN (
      SELECT lab_empleado_id FROM public.sgrh_historial_laboral
      WHERE lab_empresa_id = (SELECT public.get_empresa_id())
    )
  );

DROP POLICY IF EXISTS "datos_pago_delete" ON public.sgrh_empleado_datos_pago;
CREATE POLICY "datos_pago_delete" ON public.sgrh_empleado_datos_pago
  FOR DELETE TO authenticated
  USING (
    (SELECT public.tiene_permiso('EMPLEADOS_WRITE')) AND edp_empleado_id IN (
      SELECT lab_empleado_id FROM public.sgrh_historial_laboral
      WHERE lab_empresa_id = (SELECT public.get_empresa_id())
    )
  );

-- ─── 3. Migración de datos existentes ─────────────────────────────────────────
-- Guardada tras un chequeo de existencia de columna para que la migración sea
-- re-ejecutable después del DROP (idempotencia).


-- ─── sgrh_cat_bancos (catalogo global) ───────────────────────────────────────

DROP POLICY IF EXISTS "cat_select" ON public.sgrh_cat_bancos;
CREATE POLICY "cat_select" ON public.sgrh_cat_bancos
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "cat_insert" ON public.sgrh_cat_bancos;
CREATE POLICY "cat_insert" ON public.sgrh_cat_bancos
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.tiene_permiso('CATALOGOS_WRITE')));

DROP POLICY IF EXISTS "cat_update" ON public.sgrh_cat_bancos;
CREATE POLICY "cat_update" ON public.sgrh_cat_bancos
  FOR UPDATE TO authenticated
  USING ((SELECT public.tiene_permiso('CATALOGOS_WRITE')))
  WITH CHECK ((SELECT public.tiene_permiso('CATALOGOS_WRITE')));

DROP POLICY IF EXISTS "cat_delete" ON public.sgrh_cat_bancos;
CREATE POLICY "cat_delete" ON public.sgrh_cat_bancos
  FOR DELETE TO authenticated
  USING ((SELECT public.tiene_permiso('CATALOGOS_WRITE')));

-- Seed: un solo nombre estándar por entidad + su código IBAN. Solo entidades

-- ─── sgrh_direcciones ───────────────────────────────────────

-- Una dirección es visible si la referencia una entidad que el usuario ya puede
-- ver: su propio expediente, un empleado de su empresa, su empresa o una de sus
-- sucursales. El chequeo multi-tenant va explícito vía sgrh_historial_laboral
-- (mismo idiom que empleados_select) en vez de apoyarse en la RLS anidada de las
-- tablas referenciadas.

ALTER TABLE public.sgrh_direcciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "direcciones_select" ON public.sgrh_direcciones;
CREATE POLICY "direcciones_select" ON public.sgrh_direcciones
  FOR SELECT TO authenticated
  USING (
    dir_id IN (
      SELECT emp_direccion_id FROM public.sgrh_empleados
      WHERE emp_direccion_id IS NOT NULL AND (
        emp_id = (SELECT public.get_emp_id())
        OR (
          (SELECT public.tiene_permiso('EMPLEADOS_READ'))
          AND emp_id IN (
            SELECT lab_empleado_id FROM public.sgrh_historial_laboral
            WHERE lab_empresa_id = (SELECT public.get_empresa_id())
          )
        )
      )
    )
    OR dir_id IN (
      SELECT org_direccion_id FROM public.sgrh_empresas
      WHERE org_direccion_id IS NOT NULL
        AND org_id = (SELECT public.get_empresa_id())
    )
    OR dir_id IN (
      SELECT suc_direccion_id FROM public.sgrh_sucursales
      WHERE suc_direccion_id IS NOT NULL
        AND suc_empresa_id = (SELECT public.get_empresa_id())
    )
  );

-- En el INSERT la fila todavía no la referencia nadie, así que no hay pertenencia
-- que verificar: se gatea solo por permiso. Mismo compromiso consciente que
-- empleados_insert. El alta real pasa por la RPC (SECURITY DEFINER), donde la
-- dirección y el empleado se crean en la misma transacción.
DROP POLICY IF EXISTS "direcciones_insert" ON public.sgrh_direcciones;
CREATE POLICY "direcciones_insert" ON public.sgrh_direcciones
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.tiene_permiso('EMPLEADOS_WRITE'))
    OR (SELECT public.tiene_permiso('EMPRESAS_WRITE'))
  );

DROP POLICY IF EXISTS "direcciones_update" ON public.sgrh_direcciones;
CREATE POLICY "direcciones_update" ON public.sgrh_direcciones
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.tiene_permiso('EMPLEADOS_WRITE'))
    AND dir_id IN (
      SELECT emp_direccion_id FROM public.sgrh_empleados
      WHERE emp_direccion_id IS NOT NULL
        AND emp_id IN (
          SELECT lab_empleado_id FROM public.sgrh_historial_laboral
          WHERE lab_empresa_id = (SELECT public.get_empresa_id())
        )
    )
  )
  WITH CHECK (
    (SELECT public.tiene_permiso('EMPLEADOS_WRITE'))
    AND dir_id IN (
      SELECT emp_direccion_id FROM public.sgrh_empleados
      WHERE emp_direccion_id IS NOT NULL
        AND emp_id IN (
          SELECT lab_empleado_id FROM public.sgrh_historial_laboral
          WHERE lab_empresa_id = (SELECT public.get_empresa_id())
        )
    )
  );

DROP POLICY IF EXISTS "direcciones_delete" ON public.sgrh_direcciones;
CREATE POLICY "direcciones_delete" ON public.sgrh_direcciones
  FOR DELETE TO authenticated
  USING (
    (SELECT public.tiene_permiso('EMPLEADOS_WRITE'))
    AND dir_id IN (
      SELECT emp_direccion_id FROM public.sgrh_empleados
      WHERE emp_direccion_id IS NOT NULL
        AND emp_id IN (
          SELECT lab_empleado_id FROM public.sgrh_historial_laboral
          WHERE lab_empresa_id = (SELECT public.get_empresa_id())
        )
    )
  );

-- ─── sgrh_biometria_empleado / sgrh_biometria_auditoria ───────────────────────────────────────

-- Lectura: el kiosco (ASISTENCIA_WRITE) necesita bajar los vectores de su
-- empresa para comparar en el Server Action; el gerente (EMPLEADOS_WRITE)
-- los necesita para saber quien esta enrolado.
DROP POLICY IF EXISTS "biometria_select" ON public.sgrh_biometria_empleado;
CREATE POLICY "biometria_select" ON public.sgrh_biometria_empleado
  FOR SELECT TO authenticated
  USING (
    bio_empresa_id = (SELECT public.get_empresa_id())
    AND (
      (SELECT public.tiene_permiso('ASISTENCIA_WRITE'))
      OR (SELECT public.tiene_permiso('EMPLEADOS_WRITE'))
    )
    -- Los vectores faciales son el dato más sensible de la tabla: un usuario
    -- adscrito a una sucursal (kiosco, gerente) solo lee los de SU personal
    -- activo. Sin esto, un kiosco podía descargarse la biometría completa de
    -- la empresa. Quien opera a nivel empresa (ADMIN) no queda restringido.
    AND (
      (SELECT public.get_sucursal_id()) IS NULL
      OR bio_empleado_id IN (
        SELECT lab_empleado_id
        FROM public.sgrh_historial_laboral
        WHERE lab_empresa_id = (SELECT public.get_empresa_id())
          AND lab_fecha_fin IS NULL
          AND lab_sucursal_id = (SELECT public.get_sucursal_id())
      )
    )
  );

-- Escritura: SOLO el enrolamiento del gerente. El kiosco nunca escribe
-- vectores (solo los lee para comparar).
DROP POLICY IF EXISTS "biometria_insert" ON public.sgrh_biometria_empleado;
CREATE POLICY "biometria_insert" ON public.sgrh_biometria_empleado
  FOR INSERT TO authenticated
  WITH CHECK (
    bio_empresa_id = (SELECT public.get_empresa_id())
    AND (SELECT public.tiene_permiso('EMPLEADOS_WRITE'))
  );

DROP POLICY IF EXISTS "biometria_update" ON public.sgrh_biometria_empleado;
CREATE POLICY "biometria_update" ON public.sgrh_biometria_empleado
  FOR UPDATE TO authenticated
  USING (
    bio_empresa_id = (SELECT public.get_empresa_id())
    AND (SELECT public.tiene_permiso('EMPLEADOS_WRITE'))
  )
  WITH CHECK (
    bio_empresa_id = (SELECT public.get_empresa_id())
    AND (SELECT public.tiene_permiso('EMPLEADOS_WRITE'))
  );

DROP POLICY IF EXISTS "biometria_delete" ON public.sgrh_biometria_empleado;
CREATE POLICY "biometria_delete" ON public.sgrh_biometria_empleado
  FOR DELETE TO authenticated
  USING (
    bio_empresa_id = (SELECT public.get_empresa_id())
    AND (SELECT public.tiene_permiso('EMPLEADOS_WRITE'))
  );

-- ─── 2. Auditoria de rechazos faciales ─────────────────────────────────────
-- Solo se registran los intentos DENIED (distancia > 0.7: persona diferente),
-- que es lo que exige auditoria segun el diseño. bia_mejor_empleado_id es el
-- candidato mas cercano (informativo para el gerente), NO una acusacion.
ALTER TABLE public.sgrh_biometria_auditoria ENABLE ROW LEVEL SECURITY;

-- Inserta el kiosco (ASISTENCIA_WRITE) cuando verifyFace devuelve DENIED.
DROP POLICY IF EXISTS "biometria_auditoria_insert" ON public.sgrh_biometria_auditoria;
CREATE POLICY "biometria_auditoria_insert" ON public.sgrh_biometria_auditoria
  FOR INSERT TO authenticated
  WITH CHECK (
    bia_empresa_id = (SELECT public.get_empresa_id())
    AND (SELECT public.tiene_permiso('ASISTENCIA_WRITE'))
  );

-- Lee el gerente desde el panel de asistencia. Sin UPDATE/DELETE: un log de
-- auditoria es inmutable por definicion.
DROP POLICY IF EXISTS "biometria_auditoria_select" ON public.sgrh_biometria_auditoria;
CREATE POLICY "biometria_auditoria_select" ON public.sgrh_biometria_auditoria
  FOR SELECT TO authenticated
  USING (
    bia_empresa_id = (SELECT public.get_empresa_id())
    AND (SELECT public.tiene_permiso('ASISTENCIA_READ'))
  );

-- ─── sgrh_cat_tipos_documento + sgrh_documentos ───────────────────────────────────────

DROP POLICY IF EXISTS "cat_select" ON public.sgrh_cat_tipos_documento;
CREATE POLICY "cat_select" ON public.sgrh_cat_tipos_documento
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "cat_insert" ON public.sgrh_cat_tipos_documento;
CREATE POLICY "cat_insert" ON public.sgrh_cat_tipos_documento
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.tiene_permiso('CATALOGOS_WRITE')));

DROP POLICY IF EXISTS "cat_update" ON public.sgrh_cat_tipos_documento;
CREATE POLICY "cat_update" ON public.sgrh_cat_tipos_documento
  FOR UPDATE TO authenticated
  USING ((SELECT public.tiene_permiso('CATALOGOS_WRITE')))
  WITH CHECK ((SELECT public.tiene_permiso('CATALOGOS_WRITE')));

DROP POLICY IF EXISTS "cat_delete" ON public.sgrh_cat_tipos_documento;
CREATE POLICY "cat_delete" ON public.sgrh_cat_tipos_documento
  FOR DELETE TO authenticated
  USING ((SELECT public.tiene_permiso('CATALOGOS_WRITE')));

ALTER TABLE public.sgrh_documentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "documentos_select" ON public.sgrh_documentos;
CREATE POLICY "documentos_select" ON public.sgrh_documentos
  FOR SELECT TO authenticated
  USING (
    doc_empresa_id = (SELECT public.get_empresa_id())
    AND (SELECT public.tiene_permiso('DOCUMENTOS_READ'))
  );

DROP POLICY IF EXISTS "documentos_insert" ON public.sgrh_documentos;
CREATE POLICY "documentos_insert" ON public.sgrh_documentos
  FOR INSERT TO authenticated
  WITH CHECK (
    doc_empresa_id = (SELECT public.get_empresa_id())
    AND (SELECT public.tiene_permiso('DOCUMENTOS_WRITE'))
  );

DROP POLICY IF EXISTS "documentos_update" ON public.sgrh_documentos;
CREATE POLICY "documentos_update" ON public.sgrh_documentos
  FOR UPDATE TO authenticated
  USING (
    doc_empresa_id = (SELECT public.get_empresa_id())
    AND (SELECT public.tiene_permiso('DOCUMENTOS_WRITE'))
  )
  WITH CHECK (
    doc_empresa_id = (SELECT public.get_empresa_id())
    AND (SELECT public.tiene_permiso('DOCUMENTOS_WRITE'))
  );

DROP POLICY IF EXISTS "documentos_delete" ON public.sgrh_documentos;
CREATE POLICY "documentos_delete" ON public.sgrh_documentos
  FOR DELETE TO authenticated
  USING (
    doc_empresa_id = (SELECT public.get_empresa_id())
    AND (SELECT public.tiene_permiso('DOCUMENTOS_WRITE'))
  );

-- ─── sgrh_banco_horas_movimientos ───────────────────────────────────────

-- Mismo patrón de RLS que sgrh_beneficios_empleado / sgrh_liquidaciones: el
-- empleado dueño del historial puede ver sus propios movimientos;
-- NOMINA_READ/WRITE ve y administra los de su empresa.
DROP POLICY IF EXISTS "banco_horas_select" ON public.sgrh_banco_horas_movimientos;

CREATE POLICY "banco_horas_select" ON public.sgrh_banco_horas_movimientos FOR
SELECT TO authenticated USING (
        bhm_historial_laboral_id IN (
            SELECT lab_id
            FROM public.sgrh_historial_laboral
            WHERE
                lab_empleado_id = (
                    SELECT public.get_emp_id ()
                )
        )
        OR (
            (
                SELECT public.tiene_permiso ('NOMINA_READ')
            )
            AND bhm_historial_laboral_id IN (
                SELECT lab_id
                FROM public.sgrh_historial_laboral
                WHERE
                    lab_empresa_id = (
                        SELECT public.get_empresa_id ()
                    )
            )
        )
    );

DROP POLICY IF EXISTS "banco_horas_insert" ON public.sgrh_banco_horas_movimientos;

CREATE POLICY "banco_horas_insert" ON public.sgrh_banco_horas_movimientos FOR INSERT TO authenticated
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
        AND bhm_historial_laboral_id IN (
            SELECT lab_id
            FROM public.sgrh_historial_laboral
            WHERE
                lab_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
        )
    );

DROP POLICY IF EXISTS "banco_horas_update" ON public.sgrh_banco_horas_movimientos;

CREATE POLICY "banco_horas_update" ON public.sgrh_banco_horas_movimientos
FOR UPDATE
    TO authenticated USING (
        (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
        AND bhm_historial_laboral_id IN (
            SELECT lab_id
            FROM public.sgrh_historial_laboral
            WHERE
                lab_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
        )
    )
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
        AND bhm_historial_laboral_id IN (
            SELECT lab_id
            FROM public.sgrh_historial_laboral
            WHERE
                lab_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
        )
    );

DROP POLICY IF EXISTS "banco_horas_delete" ON public.sgrh_banco_horas_movimientos;

CREATE POLICY "banco_horas_delete" ON public.sgrh_banco_horas_movimientos FOR DELETE TO authenticated USING (
    (
        SELECT public.tiene_permiso ('NOMINA_WRITE')
    )
    AND bhm_historial_laboral_id IN (
        SELECT lab_id
        FROM public.sgrh_historial_laboral
        WHERE
            lab_empresa_id = (
                SELECT public.get_empresa_id ()
            )
    )
);

-- ─── sgrh_liquidaciones ───────────────────────────────────────

-- Mismo patrón de RLS que sgrh_provisiones_anuales: el empleado dueño del
-- historial puede ver su propia liquidación; NOMINA_READ/WRITE ve y
-- administra las de su empresa.
DROP POLICY IF EXISTS "liquidaciones_select" ON public.sgrh_liquidaciones;

CREATE POLICY "liquidaciones_select" ON public.sgrh_liquidaciones FOR
SELECT TO authenticated USING (
        liq_historial_laboral_id IN (
            SELECT lab_id
            FROM public.sgrh_historial_laboral
            WHERE
                lab_empleado_id = (
                    SELECT public.get_emp_id ()
                )
        )
        OR (
            (
                SELECT public.tiene_permiso ('NOMINA_READ')
            )
            AND liq_historial_laboral_id IN (
                SELECT lab_id
                FROM public.sgrh_historial_laboral
                WHERE
                    lab_empresa_id = (
                        SELECT public.get_empresa_id ()
                    )
            )
        )
    );

DROP POLICY IF EXISTS "liquidaciones_insert" ON public.sgrh_liquidaciones;

CREATE POLICY "liquidaciones_insert" ON public.sgrh_liquidaciones FOR INSERT TO authenticated
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
        AND liq_historial_laboral_id IN (
            SELECT lab_id
            FROM public.sgrh_historial_laboral
            WHERE
                lab_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
        )
    );

DROP POLICY IF EXISTS "liquidaciones_update" ON public.sgrh_liquidaciones;

CREATE POLICY "liquidaciones_update" ON public.sgrh_liquidaciones
FOR UPDATE
    TO authenticated USING (
        (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
        AND liq_historial_laboral_id IN (
            SELECT lab_id
            FROM public.sgrh_historial_laboral
            WHERE
                lab_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
        )
    )
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
        AND liq_historial_laboral_id IN (
            SELECT lab_id
            FROM public.sgrh_historial_laboral
            WHERE
                lab_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
        )
    );

DROP POLICY IF EXISTS "liquidaciones_delete" ON public.sgrh_liquidaciones;

CREATE POLICY "liquidaciones_delete" ON public.sgrh_liquidaciones FOR DELETE TO authenticated USING (
    (
        SELECT public.tiene_permiso ('NOMINA_WRITE')
    )
    AND liq_historial_laboral_id IN (
        SELECT lab_id
        FROM public.sgrh_historial_laboral
        WHERE
            lab_empresa_id = (
                SELECT public.get_empresa_id ()
            )
    )
);
