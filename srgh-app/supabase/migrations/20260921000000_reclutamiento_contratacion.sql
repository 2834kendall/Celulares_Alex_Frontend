-- =====================================================================
-- SGRH-61 — Modulo de Reclutamiento y Contratacion
-- =====================================================================
-- Cierra los huecos de sgrh_candidatos / sgrh_postulaciones /
-- sgrh_postulacion_etapas (ya existentes desde el baseline) y agrega lo
-- que falta para el tablero de seleccion y la contratacion:
--
--   1. Candidatos sin aislar por empresa. candidatos_select/insert/
--      update/delete solo pedian RECLUTAMIENTO_READ/WRITE, sin filtrar
--      tenant -- a diferencia de postulaciones_select, que si exige
--      pos_empresa_id = get_empresa_id(). Cualquier empresa con el
--      permiso podia leer, editar y BORRAR los candidatos de otra
--      (cedula, telefono, CV). Se agrega cdt_empresa_id, se rellena desde
--      las postulaciones existentes (ver 1a) y se reescriben las 4
--      policies con el mismo patron que sgrh_documentos.
--   2. Candidatos duplicados: se agrega UNIQUE de identificacion por
--      empresa.
--   3. El CV era un varchar suelto (cdt_cv_url): se reemplaza por
--      sgrh_candidato_documentos, mismo patron que sgrh_documentos pero
--      con permiso propio de Reclutamiento (no DOCUMENTOS_*).
--   4. La postulacion no sabia en que etapa iba ni a que empleado
--      resulto: se agregan pos_etapa_actual_id, pos_empleado_id,
--      pos_motivo_descarte, pos_fecha_cierre, pos_puntaje_promedio y un
--      CHECK sobre pos_estado_final.
--   5. pet_resultado tampoco tenia restriccion, aunque el comentario de
--      la tabla ya documentaba el vocabulario esperado.
--   6. El catalogo de 20 etapas no distinguia las 3 columnas del tablero
--      de seleccion, y las etapas 14-18 (Induccion, Periodo de Prueba,
--      Evaluacion de Periodo de Prueba, Contratacion Definitiva) quedan
--      obsoletas como paso de POSTULACION: ese seguimiento vive en
--      sgrh_historial_laboral una vez la persona ya es empleada (el
--      periodo de prueba es un tipo de contrato -- tco PRUEBA, Art. 30
--      CT -- no un estado de postulacion). Se agrega eta_fase y se
--      desactivan esas 5 etapas.
--   7. Puntaje de candidatos: catalogo de criterios editable
--      (sgrh_cat_areas_seleccion / sgrh_cat_criterios_seleccion, mismo
--      patron "rubro" que evaluacion de desempeño pero en tablas propias
--      -- sgrh_evaluaciones exige un historial_laboral que un candidato
--      no tiene) y resultados por postulacion
--      (sgrh_postulacion_puntajes).
--   8. Indices en las columnas que el tablero y la ficha de candidato
--      van a filtrar.
--   9. registrar_etapa_postulacion(): agrupa en una transaccion el
--      INSERT del historial de etapa y el UPDATE de la etapa actual, que
--      hasta ahora serian dos escrituras sueltas desde el cliente.
--
-- Archivo idempotente: se puede re-ejecutar sin efectos.
-- =====================================================================

-- ─── 1. Candidatos: aislar por empresa (fix de seguridad) ─────────────

ALTER TABLE public.sgrh_candidatos
  ADD COLUMN IF NOT EXISTS cdt_empresa_id integer REFERENCES public.sgrh_empresas (org_id);

-- ─── 1a. Backfill de la empresa de los candidatos ya registrados ──────
-- Hasta ahora el vinculo candidato→empresa vivia en sgrh_postulaciones
-- ("el vinculo con la empresa nace en sgrh_postulaciones", comentarios.sql),
-- asi que de ahi sale la empresa de cada candidato existente.

-- Guarda: un candidato con postulaciones en DOS empresas distintas no se
-- puede resolver solo. Aislarlo por empresa exigiria duplicarlo (una copia
-- por empresa) y repuntar cada postulacion a su copia -- eso es una
-- decision sobre los DATOS, no sobre el esquema, asi que la migracion se
-- detiene y lo reporta en vez de elegir una empresa al azar.
DO $$
DECLARE
  v_ambiguos int;
BEGIN
  SELECT count(*) INTO v_ambiguos
  FROM (
    SELECT pos_candidato_id
    FROM public.sgrh_postulaciones
    GROUP BY pos_candidato_id
    HAVING count(DISTINCT pos_empresa_id) > 1
  ) t;

  IF v_ambiguos > 0 THEN
    RAISE EXCEPTION
      'SGRH-61: % candidato(s) tienen postulaciones en mas de una empresa. Hay que decidir que hacer con ellos (duplicar el candidato, una copia por empresa) antes de aislar candidatos por empresa.',
      v_ambiguos;
  END IF;
END
$$;

UPDATE public.sgrh_candidatos c
SET cdt_empresa_id = p.empresa_id
FROM (
  -- Sin ambiguedad tras la guarda de arriba: min() solo desempata filas
  -- que ya tienen todas la misma empresa.
  SELECT pos_candidato_id, min(pos_empresa_id) AS empresa_id
  FROM public.sgrh_postulaciones
  GROUP BY pos_candidato_id
) p
WHERE p.pos_candidato_id = c.cdt_id
  AND c.cdt_empresa_id IS NULL;

-- Candidatos que nunca postularon: si el sistema tiene UNA sola empresa,
-- son de esa. Con varias no hay de donde deducirlo.
UPDATE public.sgrh_candidatos
SET cdt_empresa_id = (SELECT org_id FROM public.sgrh_empresas LIMIT 1)
WHERE cdt_empresa_id IS NULL
  AND (SELECT count(*) FROM public.sgrh_empresas) = 1;

-- Lo que quede sin empresa no lo puede resolver un script: se avisa con
-- un mensaje util en vez del 23502 crudo del SET NOT NULL.
DO $$
DECLARE
  v_huerfanos int;
BEGIN
  SELECT count(*) INTO v_huerfanos
  FROM public.sgrh_candidatos
  WHERE cdt_empresa_id IS NULL;

  IF v_huerfanos > 0 THEN
    RAISE EXCEPTION
      'SGRH-61: quedan % candidato(s) sin empresa (no tienen postulaciones y hay mas de una empresa). Asignales cdt_empresa_id a mano y volve a correr la migracion.',
      v_huerfanos;
  END IF;
END
$$;

ALTER TABLE public.sgrh_candidatos
  ALTER COLUMN cdt_empresa_id SET NOT NULL;

DROP POLICY IF EXISTS "candidatos_select" ON public.sgrh_candidatos;
CREATE POLICY "candidatos_select" ON public.sgrh_candidatos FOR
SELECT TO authenticated USING (
    cdt_empresa_id = (SELECT public.get_empresa_id ())
    AND (SELECT public.tiene_permiso ('RECLUTAMIENTO_READ'))
);

DROP POLICY IF EXISTS "candidatos_insert" ON public.sgrh_candidatos;
CREATE POLICY "candidatos_insert" ON public.sgrh_candidatos FOR INSERT TO authenticated
WITH
    CHECK (
        cdt_empresa_id = (SELECT public.get_empresa_id ())
        AND (SELECT public.tiene_permiso ('RECLUTAMIENTO_WRITE'))
    );

DROP POLICY IF EXISTS "candidatos_update" ON public.sgrh_candidatos;
CREATE POLICY "candidatos_update" ON public.sgrh_candidatos
FOR UPDATE
    TO authenticated USING (
        cdt_empresa_id = (SELECT public.get_empresa_id ())
        AND (SELECT public.tiene_permiso ('RECLUTAMIENTO_WRITE'))
    )
WITH
    CHECK (
        cdt_empresa_id = (SELECT public.get_empresa_id ())
        AND (SELECT public.tiene_permiso ('RECLUTAMIENTO_WRITE'))
    );

DROP POLICY IF EXISTS "candidatos_delete" ON public.sgrh_candidatos;
CREATE POLICY "candidatos_delete" ON public.sgrh_candidatos FOR DELETE TO authenticated USING (
    cdt_empresa_id = (SELECT public.get_empresa_id ())
    AND (SELECT public.tiene_permiso ('RECLUTAMIENTO_WRITE'))
);

-- ─── 2. Candidatos: identificacion unica por empresa ──────────────────

ALTER TABLE public.sgrh_candidatos
  DROP CONSTRAINT IF EXISTS sgrh_cdt_identificacion_unica;
ALTER TABLE public.sgrh_candidatos
  ADD CONSTRAINT sgrh_cdt_identificacion_unica
  UNIQUE (cdt_empresa_id, cdt_tipo_identificacion_id, cdt_numero_identificacion);

CREATE INDEX IF NOT EXISTS idx_candidatos_empresa ON public.sgrh_candidatos (cdt_empresa_id);

-- ─── 3. Candidatos: documentos gestionados en vez de un varchar suelto ─

ALTER TABLE public.sgrh_candidatos DROP COLUMN IF EXISTS cdt_cv_url;

CREATE TABLE IF NOT EXISTS public.sgrh_candidato_documentos (
  cdo_id           serial PRIMARY KEY,
  cdo_empresa_id   int NOT NULL REFERENCES public.sgrh_empresas (org_id),
  cdo_candidato_id int NOT NULL REFERENCES public.sgrh_candidatos (cdt_id) ON DELETE CASCADE,
  cdo_tipo         varchar(20) NOT NULL,
  cdo_nombre       varchar(150) NOT NULL,
  -- Ruta en el bucket cv-candidatos: <empresa_id>/candidatos/<candidato_id>/<uuid>.<ext>.
  -- Nunca se expone al cliente, igual que doc_path en sgrh_documentos.
  cdo_path         text NOT NULL UNIQUE,
  cdo_mime         varchar(100) NOT NULL,
  cdo_creado_por   int REFERENCES public.sgrh_usuarios (usr_id),
  cdo_created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sgrh_cdo_tipo_check CHECK (cdo_tipo IN ('CV', 'CEDULA', 'REFERENCIA', 'TITULO', 'OTRO'))
);

CREATE INDEX IF NOT EXISTS idx_candidato_documentos_candidato ON public.sgrh_candidato_documentos (cdo_candidato_id);
CREATE INDEX IF NOT EXISTS idx_candidato_documentos_empresa ON public.sgrh_candidato_documentos (cdo_empresa_id);

ALTER TABLE public.sgrh_candidato_documentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "candidato_documentos_select" ON public.sgrh_candidato_documentos;
CREATE POLICY "candidato_documentos_select" ON public.sgrh_candidato_documentos FOR
SELECT TO authenticated USING (
    cdo_empresa_id = (SELECT public.get_empresa_id ())
    AND (SELECT public.tiene_permiso ('RECLUTAMIENTO_READ'))
);

DROP POLICY IF EXISTS "candidato_documentos_insert" ON public.sgrh_candidato_documentos;
CREATE POLICY "candidato_documentos_insert" ON public.sgrh_candidato_documentos FOR INSERT TO authenticated
WITH
    CHECK (
        cdo_empresa_id = (SELECT public.get_empresa_id ())
        AND (SELECT public.tiene_permiso ('RECLUTAMIENTO_WRITE'))
    );

DROP POLICY IF EXISTS "candidato_documentos_update" ON public.sgrh_candidato_documentos;
CREATE POLICY "candidato_documentos_update" ON public.sgrh_candidato_documentos
FOR UPDATE
    TO authenticated USING (
        cdo_empresa_id = (SELECT public.get_empresa_id ())
        AND (SELECT public.tiene_permiso ('RECLUTAMIENTO_WRITE'))
    )
WITH
    CHECK (
        cdo_empresa_id = (SELECT public.get_empresa_id ())
        AND (SELECT public.tiene_permiso ('RECLUTAMIENTO_WRITE'))
    );

DROP POLICY IF EXISTS "candidato_documentos_delete" ON public.sgrh_candidato_documentos;
CREATE POLICY "candidato_documentos_delete" ON public.sgrh_candidato_documentos FOR DELETE TO authenticated USING (
    cdo_empresa_id = (SELECT public.get_empresa_id ())
    AND (SELECT public.tiene_permiso ('RECLUTAMIENTO_WRITE'))
);

-- ─── 4. Postulaciones: etapa actual, empleado resultante, cierre ──────

ALTER TABLE public.sgrh_postulaciones
  ADD COLUMN IF NOT EXISTS pos_etapa_actual_id integer REFERENCES public.sgrh_cat_etapas_seleccion (eta_id),
  ADD COLUMN IF NOT EXISTS pos_empleado_id integer REFERENCES public.sgrh_empleados (emp_id),
  ADD COLUMN IF NOT EXISTS pos_motivo_descarte character varying,
  ADD COLUMN IF NOT EXISTS pos_fecha_cierre date,
  ADD COLUMN IF NOT EXISTS pos_puntaje_promedio numeric;

ALTER TABLE public.sgrh_postulaciones
  DROP CONSTRAINT IF EXISTS sgrh_pos_estado_final_check;
ALTER TABLE public.sgrh_postulaciones
  ADD CONSTRAINT sgrh_pos_estado_final_check
  CHECK (pos_estado_final IN ('en_proceso', 'contratado', 'descartado'));

CREATE INDEX IF NOT EXISTS idx_postulaciones_candidato ON public.sgrh_postulaciones (pos_candidato_id);
CREATE INDEX IF NOT EXISTS idx_postulaciones_empresa ON public.sgrh_postulaciones (pos_empresa_id);
CREATE INDEX IF NOT EXISTS idx_postulaciones_estado ON public.sgrh_postulaciones (pos_estado_final);

-- ─── 5. Etapas de postulacion: resultado con vocabulario fijo ─────────

ALTER TABLE public.sgrh_postulacion_etapas
  DROP CONSTRAINT IF EXISTS sgrh_pet_resultado_check;
ALTER TABLE public.sgrh_postulacion_etapas
  ADD CONSTRAINT sgrh_pet_resultado_check
  CHECK (pet_resultado IS NULL OR pet_resultado IN ('aprobado', 'rechazado', 'pendiente'));

CREATE INDEX IF NOT EXISTS idx_postulacion_etapas_postulacion ON public.sgrh_postulacion_etapas (pet_postulacion_id);

-- ─── 6. Catalogo de etapas: fase del tablero, retiro de 14-18 ─────────
-- Por nombre, nunca por eta_id: mismo motivo que 20260918120000 (los ids
-- de un catalogo sembrado con ON CONFLICT DO NOTHING pueden desfasarse
-- entre entornos).

ALTER TABLE public.sgrh_cat_etapas_seleccion
  ADD COLUMN IF NOT EXISTS eta_fase smallint;

UPDATE public.sgrh_cat_etapas_seleccion
SET eta_fase = 1
WHERE eta_nombre IN ('Recepción de CV', 'Filtro Curricular');

UPDATE public.sgrh_cat_etapas_seleccion
SET eta_fase = 2
WHERE eta_nombre IN (
  'Entrevista Telefónica', 'Prueba Técnica', 'Prueba Psicométrica',
  'Entrevista con RRHH', 'Entrevista con Jefatura',
  'Verificación de Referencias', 'Estudio de Antecedentes',
  'Examen Médico Pre-empleo', 'Segunda Entrevista Técnica',
  'Assessment Center'
);

UPDATE public.sgrh_cat_etapas_seleccion
SET eta_fase = 3
WHERE eta_nombre IN ('Oferta Laboral', 'Negociación de Condiciones', 'Firma de Contrato');

-- Induccion, periodo de prueba y contratacion definitiva ya no son un
-- paso de POSTULACION (ver comentario del encabezado, punto 6). Se
-- desactivan, no se borran: pueden existir filas historicas de
-- postulacion_etapas que las referencian.
UPDATE public.sgrh_cat_etapas_seleccion
SET eta_activo = false
WHERE eta_nombre IN (
  'Inducción General', 'Inducción al Puesto', 'Período de Prueba',
  'Evaluación de Período de Prueba', 'Contratación Definitiva'
);

-- ─── 7. Puntaje de candidatos: catalogo editable + resultados ─────────

CREATE TABLE IF NOT EXISTS public.sgrh_cat_areas_seleccion (
  are_id              integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  are_nombre          character varying NOT NULL UNIQUE,
  are_tipo_aplicacion character varying NOT NULL DEFAULT 'ambos',
  are_activo          boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.sgrh_cat_criterios_seleccion (
  cri_id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cri_area_id     integer NOT NULL REFERENCES public.sgrh_cat_areas_seleccion (are_id),
  cri_descripcion character varying NOT NULL,
  cri_activo      boolean NOT NULL DEFAULT true
);

ALTER TABLE public.sgrh_cat_areas_seleccion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sgrh_cat_criterios_seleccion ENABLE ROW LEVEL SECURITY;

-- Mismo patron "catalogo global" que sgrh_cat_areas_evaluacion /
-- sgrh_cat_criterios_evaluacion (rls_policies.sql linea ~118): lectura
-- para cualquier autenticado, escritura con CATALOGOS_WRITE -- Edwin
-- administra los criterios de seleccion desde la misma pantalla de
-- catalogos que ya usan las evaluaciones de desempeño.
DO $$
DECLARE
  t text;
  catalogos text[] := ARRAY['sgrh_cat_areas_seleccion', 'sgrh_cat_criterios_seleccion'];
BEGIN
  FOREACH t IN ARRAY catalogos LOOP
    EXECUTE format('DROP POLICY IF EXISTS "cat_select" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "cat_select" ON public.%I
       FOR SELECT
       TO authenticated
       USING (true)', t);
    EXECUTE format('DROP POLICY IF EXISTS "cat_insert" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "cat_insert" ON public.%I
       FOR INSERT
       TO authenticated
       WITH CHECK ((SELECT public.tiene_permiso(''CATALOGOS_WRITE'')))', t);
    EXECUTE format('DROP POLICY IF EXISTS "cat_update" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "cat_update" ON public.%I
       FOR UPDATE
       TO authenticated
       USING ((SELECT public.tiene_permiso(''CATALOGOS_WRITE'')))
       WITH CHECK ((SELECT public.tiene_permiso(''CATALOGOS_WRITE'')))', t);
    EXECUTE format('DROP POLICY IF EXISTS "cat_delete" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "cat_delete" ON public.%I
       FOR DELETE
       TO authenticated
       USING ((SELECT public.tiene_permiso(''CATALOGOS_WRITE'')))', t);
  END LOOP;
END;
$$;

CREATE TABLE IF NOT EXISTS public.sgrh_postulacion_puntajes (
  psc_id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  psc_postulacion_id integer NOT NULL REFERENCES public.sgrh_postulaciones (pos_id) ON DELETE CASCADE,
  psc_criterio_id    integer NOT NULL REFERENCES public.sgrh_cat_criterios_seleccion (cri_id),
  psc_puntaje        numeric,
  psc_observacion    character varying,
  psc_no_aplica      boolean NOT NULL DEFAULT false,
  UNIQUE (psc_postulacion_id, psc_criterio_id)
);

CREATE INDEX IF NOT EXISTS idx_postulacion_puntajes_postulacion ON public.sgrh_postulacion_puntajes (psc_postulacion_id);

ALTER TABLE public.sgrh_postulacion_puntajes ENABLE ROW LEVEL SECURITY;

-- Mismo idioma que postulacion_etapas_select: la postulacion no tiene
-- empresa propia en esta tabla, se resuelve via sgrh_postulaciones.
DROP POLICY IF EXISTS "postulacion_puntajes_select" ON public.sgrh_postulacion_puntajes;
CREATE POLICY "postulacion_puntajes_select" ON public.sgrh_postulacion_puntajes FOR
SELECT TO authenticated USING (
    psc_postulacion_id IN (
        SELECT pos_id FROM public.sgrh_postulaciones
        WHERE pos_empresa_id = (SELECT public.get_empresa_id ())
    )
    AND (SELECT public.tiene_permiso ('RECLUTAMIENTO_READ'))
);

DROP POLICY IF EXISTS "postulacion_puntajes_insert" ON public.sgrh_postulacion_puntajes;
CREATE POLICY "postulacion_puntajes_insert" ON public.sgrh_postulacion_puntajes FOR INSERT TO authenticated
WITH
    CHECK (
        psc_postulacion_id IN (
            SELECT pos_id FROM public.sgrh_postulaciones
            WHERE pos_empresa_id = (SELECT public.get_empresa_id ())
        )
        AND (SELECT public.tiene_permiso ('RECLUTAMIENTO_WRITE'))
    );

DROP POLICY IF EXISTS "postulacion_puntajes_update" ON public.sgrh_postulacion_puntajes;
CREATE POLICY "postulacion_puntajes_update" ON public.sgrh_postulacion_puntajes
FOR UPDATE
    TO authenticated USING (
        psc_postulacion_id IN (
            SELECT pos_id FROM public.sgrh_postulaciones
            WHERE pos_empresa_id = (SELECT public.get_empresa_id ())
        )
        AND (SELECT public.tiene_permiso ('RECLUTAMIENTO_WRITE'))
    )
WITH
    CHECK (
        psc_postulacion_id IN (
            SELECT pos_id FROM public.sgrh_postulaciones
            WHERE pos_empresa_id = (SELECT public.get_empresa_id ())
        )
        AND (SELECT public.tiene_permiso ('RECLUTAMIENTO_WRITE'))
    );

DROP POLICY IF EXISTS "postulacion_puntajes_delete" ON public.sgrh_postulacion_puntajes;
CREATE POLICY "postulacion_puntajes_delete" ON public.sgrh_postulacion_puntajes FOR DELETE TO authenticated USING (
    psc_postulacion_id IN (
        SELECT pos_id FROM public.sgrh_postulaciones
        WHERE pos_empresa_id = (SELECT public.get_empresa_id ())
    )
    AND (SELECT public.tiene_permiso ('RECLUTAMIENTO_WRITE'))
);

-- ─── 8. registrar_etapa_postulacion(): una transaccion, no dos llamadas ─
-- SECURITY INVOKER a proposito: no eleva privilegios, la RLS de ambas
-- tablas ya protege cada escritura por separado. La funcion solo evita
-- el estado intermedio de hacerlas como dos llamadas sueltas desde el
-- cliente.

CREATE OR REPLACE FUNCTION public.registrar_etapa_postulacion(
  p_postulacion_id integer,
  p_etapa_id       integer,
  p_resultado      character varying,
  p_fecha          date,
  p_notas          character varying DEFAULT NULL,
  p_responsable_id integer           DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_pet_id integer;
BEGIN
  INSERT INTO public.sgrh_postulacion_etapas (
    pet_postulacion_id, pet_etapa_id, pet_fecha, pet_responsable_id, pet_resultado, pet_notas
  ) VALUES (
    p_postulacion_id, p_etapa_id, p_fecha, p_responsable_id, p_resultado, p_notas
  )
  RETURNING pet_id INTO v_pet_id;

  UPDATE public.sgrh_postulaciones
  SET pos_etapa_actual_id = p_etapa_id
  WHERE pos_id = p_postulacion_id;

  RETURN v_pet_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_etapa_postulacion(integer, integer, character varying, date, character varying, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.registrar_etapa_postulacion(integer, integer, character varying, date, character varying, integer) FROM anon;
GRANT  EXECUTE ON FUNCTION public.registrar_etapa_postulacion(integer, integer, character varying, date, character varying, integer) TO authenticated;
