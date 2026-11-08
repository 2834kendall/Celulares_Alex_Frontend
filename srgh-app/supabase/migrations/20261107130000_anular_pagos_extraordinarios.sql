-- =====================================================================
-- Nómina: anular un pago de aguinaldo o de liquidación hecho por error
-- =====================================================================
-- Un pago extraordinario era inmutable (sin UPDATE ni DELETE por RLS): si se
-- pagaba por error no había forma de deshacerlo. Ahora se puede ANULAR, con
-- estas reglas:
--
--   * Solo dentro de un plazo desde que se registró el pago. El plazo lo fija
--     la empresa (org_horas_anular_pago, 48 h por defecto, de 1 a 720).
--   * Con un motivo obligatorio. El pago NO se borra: queda en el historial
--     como anulado, con quién, cuándo y por qué. Su código de verificación
--     se sigue encontrando, y el comprobante dice que está anulado.
--   * Aguinaldo: la provisión del ciclo vuelve a "sin pagar". Liquidación:
--     solo el pago (liq_pagado vuelve a false); la liquidación guardada y sus
--     montos no cambian.
--   * Después se puede volver a pagar: los índices únicos que impedían pagar
--     dos veces ahora ignoran los pagos anulados. El pago nuevo lleva otro
--     código de verificación.
--
-- El plazo se mide contra pex_pagado_en (timestamptz). pex_created_at es
-- timestamp sin zona; para los pagos ya existentes se convierte con la zona
-- de la sesión, que es la misma con que lo escribió su DEFAULT now().
--
-- Todo pasa en anular_pago_extraordinario, en una sola transacción. Es
-- SECURITY DEFINER porque la tabla no tiene policy de UPDATE (a propósito:
-- nadie puede editar los montos de un pago); la función revisa el permiso,
-- la empresa y la sucursal ella misma, y solo toca las columnas de anulación.
--
-- Idempotente.
-- =====================================================================

-- ─── 1. Plazo de la empresa ─────────────────────────────────────────────
ALTER TABLE public.sgrh_empresas
  ADD COLUMN IF NOT EXISTS org_horas_anular_pago integer NOT NULL DEFAULT 48;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sgrh_org_horas_anular_pago_chk') THEN
    ALTER TABLE public.sgrh_empresas
      ADD CONSTRAINT sgrh_org_horas_anular_pago_chk
      CHECK (org_horas_anular_pago BETWEEN 1 AND 720);
  END IF;
END
$$;

COMMENT ON COLUMN public.sgrh_empresas.org_horas_anular_pago IS
  'Horas, desde que se registra, en que se puede anular un pago de aguinaldo o liquidación hecho por error (1 a 720).';

-- ─── 2. Columnas de la anulación ───────────────────────────────────────
ALTER TABLE public.sgrh_pagos_extraordinarios
  ADD COLUMN IF NOT EXISTS pex_pagado_en timestamptz,
  ADD COLUMN IF NOT EXISTS pex_anulado_en timestamptz,
  ADD COLUMN IF NOT EXISTS pex_anulado_por integer REFERENCES public.sgrh_usuarios (usr_id),
  ADD COLUMN IF NOT EXISTS pex_anulado_por_nombre text,
  ADD COLUMN IF NOT EXISTS pex_motivo_anulacion text;

UPDATE public.sgrh_pagos_extraordinarios
SET pex_pagado_en = pex_created_at::timestamptz
WHERE pex_pagado_en IS NULL;

ALTER TABLE public.sgrh_pagos_extraordinarios
  ALTER COLUMN pex_pagado_en SET DEFAULT now(),
  ALTER COLUMN pex_pagado_en SET NOT NULL;

-- Quien registra un pago (la app, con NOMINA_WRITE y la policy de INSERT)
-- no elige cuándo empieza el plazo ni puede traer una anulación inventada:
-- sin esto, un pago insertado por la API con pex_pagado_en = 2099 se podía
-- anular para siempre. La hora la pone la base y la anulación solo la pone
-- anular_pago_extraordinario (un UPDATE, que esto no toca).
CREATE OR REPLACE FUNCTION sgrh_private.pex_sellar_alta()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.pex_pagado_en := now();
  NEW.pex_anulado_en := NULL;
  NEW.pex_anulado_por := NULL;
  NEW.pex_anulado_por_nombre := NULL;
  NEW.pex_motivo_anulacion := NULL;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION sgrh_private.pex_sellar_alta() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sgrh_pex_sellar_alta ON public.sgrh_pagos_extraordinarios;
CREATE TRIGGER sgrh_pex_sellar_alta
  BEFORE INSERT ON public.sgrh_pagos_extraordinarios
  FOR EACH ROW EXECUTE FUNCTION sgrh_private.pex_sellar_alta();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sgrh_pex_anulacion_chk') THEN
    ALTER TABLE public.sgrh_pagos_extraordinarios
      ADD CONSTRAINT sgrh_pex_anulacion_chk
      CHECK ((pex_anulado_en IS NULL) = (pex_motivo_anulacion IS NULL));
  END IF;
END
$$;

COMMENT ON COLUMN public.sgrh_pagos_extraordinarios.pex_pagado_en IS
  'Momento en que se registró el pago. Desde acá corre el plazo para anularlo.';
COMMENT ON COLUMN public.sgrh_pagos_extraordinarios.pex_anulado_en IS
  'Momento en que se anuló el pago. NULL = vigente. Un pago anulado no cuenta como pagado.';
COMMENT ON COLUMN public.sgrh_pagos_extraordinarios.pex_anulado_por_nombre IS
  'Nombre (o correo) de quien anuló, como estaba en ese momento.';
COMMENT ON COLUMN public.sgrh_pagos_extraordinarios.pex_motivo_anulacion IS
  'Por qué se anuló. Obligatorio junto con pex_anulado_en.';

-- ─── 3. Un solo pago VIGENTE por aguinaldo y por liquidación ───────────
DROP INDEX IF EXISTS public.sgrh_pex_liquidacion_unq;
CREATE UNIQUE INDEX sgrh_pex_liquidacion_unq
  ON public.sgrh_pagos_extraordinarios (pex_liquidacion_id)
  WHERE pex_liquidacion_id IS NOT NULL AND pex_anulado_en IS NULL;

DROP INDEX IF EXISTS public.sgrh_pex_aguinaldo_unq;
CREATE UNIQUE INDEX sgrh_pex_aguinaldo_unq
  ON public.sgrh_pagos_extraordinarios (pex_historial_laboral_id, pex_anio_aguinaldo)
  WHERE pex_tipo = 'aguinaldo' AND pex_anulado_en IS NULL;

COMMENT ON TABLE public.sgrh_pagos_extraordinarios IS
  'Pagos de aguinaldo y liquidación, con su propio comprobante. No dependen de un periodo de planilla. Los montos son inmutables (sin UPDATE ni DELETE por RLS); un pago por error se anula con anular_pago_extraordinario y queda en el historial.';

-- ─── 4. Anular ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.anular_pago_extraordinario(
  p_pex_id integer,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa integer := (SELECT public.get_empresa_id());
  v_usr     integer := (SELECT public.get_usr_id());
  v_motivo  text := btrim(coalesce(p_motivo, ''));
  v_horas   integer;
  v_pago    record;
  v_nombre  text;
BEGIN
  IF v_empresa IS NULL OR NOT (SELECT public.tiene_permiso('NOMINA_WRITE')) THEN
    RAISE EXCEPTION 'No tenés permiso para anular pagos.' USING ERRCODE = '42501';
  END IF;
  IF char_length(v_motivo) < 5 THEN
    RAISE EXCEPTION 'Escribí el motivo de la anulación (al menos 5 caracteres).'
      USING ERRCODE = '22023';
  END IF;
  IF char_length(v_motivo) > 500 THEN
    RAISE EXCEPTION 'El motivo no puede pasar de 500 caracteres.' USING ERRCODE = '22023';
  END IF;

  SELECT p.pex_id, p.pex_tipo, p.pex_historial_laboral_id, p.pex_liquidacion_id,
         p.pex_anio_aguinaldo, p.pex_pagado_en, p.pex_anulado_en, l.lab_sucursal_id
  INTO v_pago
  FROM public.sgrh_pagos_extraordinarios p
  JOIN public.sgrh_historial_laboral l ON l.lab_id = p.pex_historial_laboral_id
  WHERE p.pex_id = p_pex_id
    AND l.lab_empresa_id = v_empresa
  FOR UPDATE OF p;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pago no existe.' USING ERRCODE = 'P0002';
  END IF;
  IF v_pago.lab_sucursal_id IS NOT NULL
     AND NOT (SELECT public.sucursal_visible(v_pago.lab_sucursal_id)) THEN
    RAISE EXCEPTION 'Este pago es de una sucursal que tu usuario no tiene asignada.'
      USING ERRCODE = '42501';
  END IF;
  IF v_pago.pex_anulado_en IS NOT NULL THEN
    RAISE EXCEPTION 'Este pago ya estaba anulado.' USING ERRCODE = '55000';
  END IF;

  SELECT org_horas_anular_pago INTO v_horas
  FROM public.sgrh_empresas
  WHERE org_id = v_empresa;
  v_horas := coalesce(v_horas, 48);

  IF now() > v_pago.pex_pagado_en + make_interval(hours => v_horas) THEN
    RAISE EXCEPTION 'Ya pasó el plazo para anular este pago (% horas desde que se registró).', v_horas
      USING ERRCODE = '55000';
  END IF;

  SELECT coalesce(
           nullif(btrim(concat_ws(' ', e.emp_nombre, e.emp_apellido_1, e.emp_apellido_2)), ''),
           u.usr_email
         )
  INTO v_nombre
  FROM public.sgrh_usuarios u
  LEFT JOIN public.sgrh_empleados e ON e.emp_id = u.usr_empleado_id
  WHERE u.usr_id = v_usr;

  UPDATE public.sgrh_pagos_extraordinarios
  SET pex_anulado_en = now(),
      pex_anulado_por = v_usr,
      pex_anulado_por_nombre = v_nombre,
      pex_motivo_anulacion = v_motivo
  WHERE pex_id = v_pago.pex_id;

  IF v_pago.pex_tipo = 'aguinaldo' THEN
    UPDATE public.sgrh_provisiones_anuales
    SET pra_aguinaldo_pagado = false,
        pra_fecha_pago_aguinaldo = NULL
    WHERE pra_historial_laboral_id = v_pago.pex_historial_laboral_id
      AND pra_anio = v_pago.pex_anio_aguinaldo;
  ELSE
    UPDATE public.sgrh_liquidaciones
    SET liq_pagado = false,
        liq_fecha_pago = NULL
    WHERE liq_id = v_pago.pex_liquidacion_id;
  END IF;

  RETURN jsonb_build_object(
    'tipo', v_pago.pex_tipo,
    'historialLaboralId', v_pago.pex_historial_laboral_id,
    'anioAguinaldo', v_pago.pex_anio_aguinaldo,
    'liquidacionId', v_pago.pex_liquidacion_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.anular_pago_extraordinario(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.anular_pago_extraordinario(integer, text) TO authenticated;

COMMENT ON FUNCTION public.anular_pago_extraordinario(integer, text) IS
  'Anula un pago de aguinaldo o liquidación dentro del plazo de la empresa (org_horas_anular_pago), con motivo obligatorio. No borra el pago: lo deja en el historial como anulado y permite volver a pagar.';
