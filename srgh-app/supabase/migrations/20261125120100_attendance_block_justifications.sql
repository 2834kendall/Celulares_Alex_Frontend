-- SGRH-120: justificar un bloque sin goce conserva las horas trabajadas en el otro.
BEGIN;

CREATE TABLE public.sgrh_justificaciones_bloque (
  jbl_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  jbl_empresa_id integer NOT NULL REFERENCES public.sgrh_empresas(org_id),
  jbl_historial_laboral_id integer NOT NULL REFERENCES public.sgrh_historial_laboral(lab_id) ON DELETE CASCADE,
  jbl_sucursal_id integer NOT NULL REFERENCES public.sgrh_sucursales(suc_id),
  jbl_fecha date NOT NULL,
  jbl_bloque smallint NOT NULL CHECK (jbl_bloque = 2),
  jbl_tipo_ausencia_id integer NOT NULL REFERENCES public.sgrh_cat_tipos_ausencia(tau_id),
  jbl_fraccion_pagada numeric(4,3) NOT NULL CHECK (jbl_fraccion_pagada BETWEEN 0 AND 1),
  jbl_motivo text CHECK (char_length(jbl_motivo) <= 300),
  jbl_registrado_por_id integer REFERENCES public.sgrh_usuarios(usr_id),
  jbl_created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (jbl_historial_laboral_id, jbl_fecha, jbl_bloque)
);

CREATE INDEX sgrh_jbl_historial_fecha_idx
  ON public.sgrh_justificaciones_bloque (jbl_historial_laboral_id, jbl_fecha);

ALTER TABLE public.sgrh_justificaciones_bloque ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sgrh_justificaciones_bloque FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.sgrh_justificaciones_bloque TO authenticated;

CREATE POLICY "justificaciones_bloque_select" ON public.sgrh_justificaciones_bloque
FOR SELECT TO authenticated USING (
  jbl_empresa_id = (SELECT public.get_empresa_id())
  AND (SELECT public.tiene_permiso('ASISTENCIA_READ'))
  AND (SELECT public.sucursal_visible(jbl_sucursal_id))
);

CREATE POLICY "justificaciones_bloque_insert" ON public.sgrh_justificaciones_bloque
FOR INSERT TO authenticated WITH CHECK (
  jbl_empresa_id = (SELECT public.get_empresa_id())
  AND (SELECT public.tiene_permiso('AUSENCIAS_APPROVE'))
  AND (SELECT public.sucursal_visible(jbl_sucursal_id))
  AND jbl_historial_laboral_id IN (
    SELECT lab_id FROM public.sgrh_historial_laboral
    WHERE lab_empresa_id = (SELECT public.get_empresa_id())
  )
);

CREATE POLICY "justificaciones_bloque_delete" ON public.sgrh_justificaciones_bloque
FOR DELETE TO authenticated USING (
  jbl_empresa_id = (SELECT public.get_empresa_id())
  AND (SELECT public.tiene_permiso('AUSENCIAS_APPROVE'))
  AND (SELECT public.sucursal_visible(jbl_sucursal_id))
);

COMMIT;
