-- Migración: corrige clasificación de conceptos preexistentes + agrega la
-- tabla de liquidaciones (aguinaldo ya tiene tabla propia: sgrh_provisiones_anuales).
--
-- Parte 1: la migración anterior (sgrh_conceptos_nomina_tipo_calculo.sql)
-- agregó la columna con_tipo_calculo con un DEFAULT que dejó TODOS los
-- conceptos que ya existían en tu base (los que empiezan con DED/ING/PAT)
-- marcados como "monto_manual_ingreso" (suma al bruto), sin importar si en
-- realidad son deducciones. Esto corrige las deducciones (DED*). Los
-- conceptos de tipo "patronal" (PAT*) no se tocan: todavía no hay un motor
-- de cálculo para cargas patronales, así que el código los excluye de la
-- edición manual por su con_tipo, no por con_tipo_calculo.
UPDATE public.sgrh_cat_conceptos_nomina
SET
    con_tipo_calculo = 'monto_manual_deduccion'
WHERE
    con_tipo = 'deduccion'
    AND con_codigo <> 'CCSS_OBRERA';

-- Parte 2: tabla de liquidaciones (finiquitos). Queda un registro auditable
-- por cada liquidación procesada, con el desglose completo de cómo se
-- calculó (salario proporcional, aguinaldo proporcional, vacaciones,
-- preaviso, cesantía). No se puede procesar dos veces la misma asignación
-- laboral (liq_historial_laboral_id es único).
CREATE TABLE IF NOT EXISTS public.sgrh_liquidaciones (
    liq_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    liq_historial_laboral_id integer NOT NULL UNIQUE REFERENCES public.sgrh_historial_laboral (lab_id),
    liq_motivo_salida_id integer NOT NULL REFERENCES public.sgrh_cat_motivos_salida (mot_id),
    liq_fecha_salida date NOT NULL,
    liq_salario_diario numeric NOT NULL,
    liq_dias_trabajados_mes numeric NOT NULL DEFAULT 0,
    liq_salario_proporcional numeric NOT NULL DEFAULT 0,
    liq_aguinaldo_proporcional numeric NOT NULL DEFAULT 0,
    liq_dias_vacaciones_pendientes numeric NOT NULL DEFAULT 0,
    liq_vacaciones_pagadas numeric NOT NULL DEFAULT 0,
    liq_dias_preaviso numeric NOT NULL DEFAULT 0,
    liq_preaviso numeric NOT NULL DEFAULT 0,
    liq_dias_cesantia numeric NOT NULL DEFAULT 0,
    liq_cesantia numeric NOT NULL DEFAULT 0,
    liq_total numeric NOT NULL DEFAULT 0,
    liq_pagado boolean NOT NULL DEFAULT false,
    liq_fecha_pago date,
    liq_observaciones text,
    liq_created_at timestamp without time zone NOT NULL DEFAULT now ()
);

ALTER TABLE public.sgrh_liquidaciones ENABLE ROW LEVEL SECURITY;

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
