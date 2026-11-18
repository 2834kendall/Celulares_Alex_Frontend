-- =====================================================================
-- Nómina por empresa, fase 1: cada fila de planilla lleva su sucursal
-- =====================================================================
-- Hoy el periodo de planilla es de UNA sucursal (npe_sucursal_id) y todo lo
-- que cuelga de él (filas, líneas, comprobantes) hereda de ahí a qué
-- sucursal pertenece. Para pasar a un solo periodo por empresa, la sucursal
-- tiene que ir en la fila.
--
-- Esta fase NO cambia nada visible:
--
--   * ndt_sucursal_id se rellena con la sucursal del periodo de cada fila,
--     que es exactamente lo que hoy decide quién la ve.
--   * La pone la base al insertar (trigger): la del periodo si el periodo
--     tiene sucursal, y si no, la del contrato en ese momento. Lo que mande
--     la aplicación o la API se ignora.
--   * No se puede cambiar después, y tampoco el periodo ni el contrato de la
--     fila. Es una foto, igual que la del salario (20261011120000): un
--     traslado posterior no mueve las quincenas viejas a otra sucursal.
--
-- También deja listo lo que usan las fases siguientes y que todavía nadie
-- lee: sucursales_visibles(), la bitácora de fusión de periodos (vacía) y
-- org_nomina_por_empresa (false).
--
-- Los permisos (RLS) siguen como están: los cambia la fase 2.
--
-- Idempotente.
-- =====================================================================

-- ─── 1. Sucursales que ve la cuenta ─────────────────────────────────────
-- Lo mismo que sucursal_visible(), pero como lista: sirve para filtrar con
-- IN (...) sin llamar la función una vez por fila. Incluye las inactivas,
-- porque los registros viejos siguen apuntando a ellas.
CREATE OR REPLACE FUNCTION public.sucursales_visibles()
RETURNS SETOF integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT suc_id
  FROM public.sgrh_sucursales
  WHERE suc_empresa_id = (SELECT public.get_empresa_id())
    AND (
      public.get_sucursal_ids() IS NULL
      OR suc_id = ANY (public.get_sucursal_ids())
    );
$$;

REVOKE ALL ON FUNCTION public.sucursales_visibles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sucursales_visibles() TO authenticated;

COMMENT ON FUNCTION public.sucursales_visibles() IS
  'Sucursales de la empresa del JWT que la cuenta puede ver (todas si no tiene sucursal asignada). Misma regla que sucursal_visible().';

-- ─── 2. La sucursal de la fila ──────────────────────────────────────────
ALTER TABLE public.sgrh_nomina_detalle
  ADD COLUMN IF NOT EXISTS ndt_sucursal_id integer REFERENCES public.sgrh_sucursales (suc_id);

-- Antes de crear el trigger: después, cambiar esta columna está prohibido.
UPDATE public.sgrh_nomina_detalle d
SET ndt_sucursal_id = p.npe_sucursal_id
FROM public.sgrh_nomina_periodo p
WHERE p.npe_id = d.ndt_nomina_periodo_id
  AND d.ndt_sucursal_id IS NULL;

CREATE OR REPLACE FUNCTION sgrh_private.ndt_sellar_sucursal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_per_empresa  integer;
  v_per_sucursal integer;
  v_lab_empresa  integer;
  v_lab_sucursal integer;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.ndt_sucursal_id IS DISTINCT FROM OLD.ndt_sucursal_id
       OR NEW.ndt_nomina_periodo_id IS DISTINCT FROM OLD.ndt_nomina_periodo_id
       OR NEW.ndt_historial_laboral_id IS DISTINCT FROM OLD.ndt_historial_laboral_id THEN
      RAISE EXCEPTION 'La sucursal, el periodo y el contrato de una fila de planilla no se cambian.'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  SELECT npe_empresa_id, npe_sucursal_id
  INTO v_per_empresa, v_per_sucursal
  FROM public.sgrh_nomina_periodo
  WHERE npe_id = NEW.ndt_nomina_periodo_id;

  SELECT lab_empresa_id, lab_sucursal_id
  INTO v_lab_empresa, v_lab_sucursal
  FROM public.sgrh_historial_laboral
  WHERE lab_id = NEW.ndt_historial_laboral_id;

  -- Sin periodo o sin contrato (ids que no existen) cae acá también: no hay
  -- sucursal que poner.
  IF v_per_empresa IS NULL OR v_lab_empresa IS NULL OR v_per_empresa <> v_lab_empresa THEN
    RAISE EXCEPTION 'El contrato no es de la empresa de este periodo.' USING ERRCODE = '23514';
  END IF;

  -- Periodo con sucursal: la del periodo (como hasta hoy). Periodo de toda la
  -- empresa: la del contrato en este momento.
  NEW.ndt_sucursal_id := coalesce(v_per_sucursal, v_lab_sucursal);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION sgrh_private.ndt_sellar_sucursal() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sgrh_ndt_sellar_sucursal ON public.sgrh_nomina_detalle;
CREATE TRIGGER sgrh_ndt_sellar_sucursal
  BEFORE INSERT OR UPDATE ON public.sgrh_nomina_detalle
  FOR EACH ROW EXECUTE FUNCTION sgrh_private.ndt_sellar_sucursal();

ALTER TABLE public.sgrh_nomina_detalle
  ALTER COLUMN ndt_sucursal_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_nomina_detalle_periodo_sucursal
  ON public.sgrh_nomina_detalle (ndt_nomina_periodo_id, ndt_sucursal_id);

COMMENT ON COLUMN public.sgrh_nomina_detalle.ndt_sucursal_id IS
  'Sucursal de la fila, puesta por la base al insertar (trigger sgrh_ndt_sellar_sucursal) y fija desde entonces. De ella dependen los permisos de la fila, sus líneas y su comprobante.';

-- ─── 3. Bitácora de la fusión de periodos (la llena la fase 4) ──────────
-- Un periodo viejo (de una sucursal) → el periodo de la empresa en que quedó.
-- Sirve para redirigir enlaces viejos y para revertir la fusión.
CREATE TABLE IF NOT EXISTS sgrh_private.nomina_periodo_fusion (
  npf_periodo_viejo integer PRIMARY KEY,
  npf_periodo_nuevo integer NOT NULL,
  npf_sucursal_id   integer NOT NULL,
  npf_estado        text NOT NULL,
  npf_fecha_pago    date,
  npf_observaciones text,
  npf_fusionado_en  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nomina_periodo_fusion_nuevo
  ON sgrh_private.nomina_periodo_fusion (npf_periodo_nuevo);

COMMENT ON TABLE sgrh_private.nomina_periodo_fusion IS
  'Bitácora de la fusión de periodos por sucursal en periodos por empresa: cómo era cada periodo viejo y en cuál quedó.';

-- ─── 4. Modelo de la empresa ────────────────────────────────────────────
-- false = un periodo por sucursal (hoy). La fase 4 lo pasa a true cuando
-- fusiona los periodos; la aplicación lo lee para saber si el formulario de
-- periodo nuevo pide sucursal.
ALTER TABLE public.sgrh_empresas
  ADD COLUMN IF NOT EXISTS org_nomina_por_empresa boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.sgrh_empresas.org_nomina_por_empresa IS
  'true = un solo periodo de planilla por quincena para toda la empresa. Lo activa la migración de fusión; no se cambia a mano.';

NOTIFY pgrst, 'reload schema';
