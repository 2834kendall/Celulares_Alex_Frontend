-- Migración: banco de horas extra.
--
-- Hasta ahora, cuando un empleado trabajaba más de 88 horas en la quincena
-- (TOPE_HORAS_NORMALES_QUINCENAL en el código), el sistema le pagaba las
-- horas extra automático al 1.5x dentro del mismo periodo (concepto
-- HORAS_EXTRA, con_tipo_calculo = 'horas_extra_automatico'). Ahora eso
-- cambia: las horas de más quedan "pendientes" en un banco de horas, y el
-- encargado de nómina decide para cada una, desde una pantalla aparte:
--   - Pagarla: se le sugiere un monto (horas × salario por hora × 1.5) que
--     puede ajustar, y se agrega como ingreso al periodo en borrador más
--     reciente del empleado (si le corresponde CCSS, se le descuenta igual
--     que a cualquier otro ingreso).
--   - Compensarla: no se paga nada, solo queda anotado que se resolvió así
--     (el salario base es fijo, así que trabajar menos horas la siguiente
--     quincena no necesita ningún ajuste de cálculo).
--
-- Por eso esta migración también desactiva el concepto HORAS_EXTRA del
-- catálogo (con_activo = false): ya no debe pagarse solo ni aparecer como
-- columna editable en Excel/edición manual — su función la reemplaza este
-- banco de horas.

CREATE TABLE IF NOT EXISTS public.sgrh_banco_horas_movimientos (
    bhm_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    bhm_historial_laboral_id integer NOT NULL REFERENCES public.sgrh_historial_laboral (lab_id),
    -- Periodo/detalle donde se generaron estas horas extra.
    bhm_nomina_detalle_id integer NOT NULL UNIQUE REFERENCES public.sgrh_nomina_detalle (ndt_id),
    bhm_horas numeric NOT NULL CHECK (bhm_horas > 0),
    -- Salario por hora de ese periodo, guardado aparte para que el monto
    -- sugerido (horas × salario por hora × 1.5) no cambie si el salario del
    -- empleado se actualiza después.
    bhm_salario_por_hora numeric NOT NULL DEFAULT 0,
    bhm_estado text NOT NULL DEFAULT 'pendiente' CHECK (
        bhm_estado IN ('pendiente', 'pagado', 'compensado')
    ),
    bhm_monto_pagado numeric,
    -- Periodo/detalle donde se aplicó el pago (solo si bhm_estado = 'pagado').
    bhm_nomina_detalle_pago_id integer REFERENCES public.sgrh_nomina_detalle (ndt_id),
    bhm_resuelto_por_id integer REFERENCES public.sgrh_usuarios (usr_id),
    bhm_fecha_resolucion timestamp without time zone,
    bhm_created_at timestamp without time zone NOT NULL DEFAULT now ()
);

ALTER TABLE public.sgrh_banco_horas_movimientos ENABLE ROW LEVEL SECURITY;

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

-- Desactiva el pago automático de horas extra: de ahora en adelante pasan
-- por el banco de horas. Si el concepto no existe todavía (catálogo nuevo),
-- este UPDATE simplemente no afecta ninguna fila — no falla.
UPDATE public.sgrh_cat_conceptos_nomina
SET
    con_activo = false
WHERE
    con_codigo = 'HORAS_EXTRA';
