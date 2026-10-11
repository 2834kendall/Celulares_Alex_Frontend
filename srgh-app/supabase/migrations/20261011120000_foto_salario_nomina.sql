-- Foto del contrato en cada fila de planilla, y contrato vigente editable.
--
-- La planilla congelaba los RESULTADOS (ndt_salario_bruto, ndt_salario_neto,
-- las líneas de ingreso) pero no los INSUMOS: no había ninguna columna con el
-- salario que se usó para calcular la fila. Por eso cuatro caminos volvían a
-- consultar el contrato en vivo y editarlo después alteraba cuentas ya hechas:
--
--   1. getPeriodoDetail recalcula baseDesactualizado/baseEsperado en cada
--      carga, para toda fila sin pagar.
--   2. marcarDetallePagado RECHAZA el pago cuando esa comparación no cuadra.
--   3. La incapacidad de una fila sin pagar se calcula en vivo y entra en el
--      total a pagar.
--   4. La liquidación y el aguinaldo le asignan a cada quincena pasada el
--      salario actual del contrato.
--
-- De ahí venía el bloqueo "este contrato ya pasó por planilla y no se puede
-- editar", que esta migración levanta a pedido del cliente. Con la foto, editar
-- el contrato no puede mover una fila que ya existe: los períodos ya creados
-- conservan sus montos y los valores nuevos entran en el próximo, porque crear
-- un período lee el contrato en vivo. Recalcular un período sigue adoptando el
-- contrato nuevo y reescribe la foto — es la salida para el salario mal
-- digitado que todavía no se pagó.
--
-- Las tres columnas son exactamente los campos de ContratoPago
-- (payroll/lib/prellenadoAsistencia.ts): es lo que necesita evaluarBaseGuardado
-- para seguir dando el mismo resultado. NULL = fila anterior a este cambio, y
-- se sigue calculando con el contrato en vivo, igual que ndt_monto_incapacidad.
--
-- Ojo: la detección de "desactualizado" NO muere. Pasa a comparar contra la
-- foto del contrato y contra la asistencia DE HOY, que es lo que de verdad
-- tiene que detectar: que cambiaron las horas.

ALTER TABLE public.sgrh_nomina_detalle
  ADD COLUMN IF NOT EXISTS ndt_salario_base_contrato numeric
    CHECK (ndt_salario_base_contrato IS NULL OR ndt_salario_base_contrato > 0),
  ADD COLUMN IF NOT EXISTS ndt_salario_real_contrato numeric
    CHECK (ndt_salario_real_contrato IS NULL OR ndt_salario_real_contrato > 0),
  ADD COLUMN IF NOT EXISTS ndt_horas_semanales_contrato numeric
    CHECK (ndt_horas_semanales_contrato IS NULL OR ndt_horas_semanales_contrato > 0);

COMMENT ON COLUMN public.sgrh_nomina_detalle.ndt_salario_base_contrato IS
  'lab_salario_base con que se calculó esta fila. NULL = fila anterior a 2026-10: se usa el contrato en vivo.';
COMMENT ON COLUMN public.sgrh_nomina_detalle.ndt_salario_real_contrato IS
  'lab_salario_real con que se calculó esta fila. NULL junto con el base, o cuando el contrato no tenía salario real.';
COMMENT ON COLUMN public.sgrh_nomina_detalle.ndt_horas_semanales_contrato IS
  'tjo_horas_max_semanales de la jornada con que se calculó esta fila. NULL = jornada ordinaria diurna.';

-- ─── quincena sin pagar: el guard de la sucursal base ───────────────────
-- SECURITY DEFINER a propósito, y no un EXISTS dentro de editar_contrato.
--
-- editar_contrato es SECURITY INVOKER, así que un EXISTS sobre
-- sgrh_nomina_detalle pasa por RLS: nomina_detalle_select exige NOMINA_READ y
-- además acota a los períodos de las sucursales que el usuario ve. Un usuario
-- con HISTORIAL_WRITE y sin NOMINA_READ vería CERO filas y el guard pasaría
-- de largo — fallaría ABIERTO, justo el que evita las dos filas de la misma
-- quincena. Hoy solo ADMIN y RRHH tienen HISTORIAL_WRITE y los dos tienen
-- NOMINA_READ, pero activar otro rol es un UPDATE (ver CLAUDE.md) y esto es
-- plata: el guard no puede depender de qué permisos de nómina tenga quien
-- edita el expediente.
--
-- Solo devuelve un booleano sobre un contrato que el llamador ya identificó;
-- no expone ninguna fila. Vive en sgrh_private para que PostgREST no la
-- publique, con el GRANT que el llamador necesita (mismo criterio que
-- public.sucursal_visible: ese GRANT es un requisito, no privilegio de más).
CREATE OR REPLACE FUNCTION sgrh_private.tiene_quincena_sin_pagar(p_lab_id integer)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sgrh_nomina_detalle
    WHERE ndt_historial_laboral_id = p_lab_id AND ndt_pagado = false
  );
$$;

REVOKE EXECUTE ON FUNCTION sgrh_private.tiene_quincena_sin_pagar(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION sgrh_private.tiene_quincena_sin_pagar(integer) TO authenticated;

-- Y el USAGE del ESQUEMA, que es lo que de verdad habilita la llamada: el
-- GRANT de la función no alcanza si el rol no puede entrar al esquema. Sin
-- esto, editar_contrato muere con "42501 permission denied for schema
-- sgrh_private" — toda edición, no solo un cambio de sucursal. Esta es la
-- primera función de sgrh_private que invoca un usuario; las otras dos están
-- revocadas de authenticated, así que el esquema nunca lo había necesitado.
GRANT USAGE ON SCHEMA sgrh_private TO authenticated;

COMMENT ON FUNCTION sgrh_private.tiene_quincena_sin_pagar(integer) IS
  'true si el contrato tiene alguna fila de planilla sin pagar. SECURITY DEFINER porque el guard de editar_contrato no puede depender de que quien edita el expediente tenga permisos de nómina.';

-- ─── editar_contrato ────────────────────────────────────────────────────
-- Solo el contrato VIGENTE, y ya no importa si pasó por planilla: desde la foto
-- de arriba, cambiar el salario no mueve ninguna fila ya calculada. Los montos
-- nuevos entran en el próximo período.
--
-- La SUCURSAL sí se edita, y conviene explicar por qué no es lo que parece.
-- Desde SGRH-84 son dos columnas distintas: prg_sucursal_id es dónde trabaja
-- la persona ESE día —el gerente la rota celda por celda en la matriz
-- semanal— y lab_sucursal_id es su sucursal BASE: en qué planilla se le paga
-- y quién ve su expediente. Las horas cubiertas en otra tienda ya se pagan en
-- la planilla del contrato (ver 20261002120000), así que mover la base no es
-- "trasladar" a nadie.
--
-- Y no reescribe la historia: las marcas, los turnos, los períodos de planilla
-- y las evaluaciones llevan su PROPIA sucursal (mar_/prg_/npe_/eve_sucursal_id)
-- y ninguna depende del contrato. Lo ocurrido se queda donde ocurrió, igual
-- que con la rotación. (El COMMENT del baseline dice lo contrario porque es
-- anterior a SGRH-84, cuando las dos columnas valían siempre lo mismo.)
--
-- El único riesgo real es la fila de planilla colgada: un período es por
-- sucursal y elige a su gente por lab_sucursal_id, así que mover la base con
-- una quincena a medio pagar dejaría la fila en la planilla vieja y la nueva
-- la volvería a crear — dos filas de la misma quincena. De ahí el guard.
--
-- Lo que NO se edita, y por qué:
--   - La fecha de inicio: moverla dejaría marcas, turnos y el contrato anterior
--     apuntando a un período que ya no existe. Por eso también se van las
--     cuatro validaciones que solo existían para cuidarla (contra el ingreso a
--     la empresa, contra el fin del contrato anterior, contra la primera marca
--     y contra el primer turno). Siguen vivas en crear_contrato, donde la fecha
--     sí se elige.
--   - Las columnas de salida (fecha fin, motivo, recontratable).
--
-- Sigue bloqueado el contrato con una terminación registrada: eso no es por
-- planilla, y editar las condiciones debajo de una salida ya calculada dejaría
-- la liquidación apuntando a otro contrato. Hay que revertir primero.

CREATE OR REPLACE FUNCTION public.editar_contrato(p_lab_id integer, p_contrato jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_empresa_id   integer := public.get_empresa_id();
  v_puesto_id    integer := (p_contrato->>'lab_puesto_id')::integer;
  v_tipo_id      integer := (p_contrato->>'lab_tipo_contrato_id')::integer;
  v_jornada_id   integer := (p_contrato->>'lab_tipo_jornada_id')::integer;
  v_sucursal_id  integer := (p_contrato->>'lab_sucursal_id')::integer;
  v_base         numeric := (p_contrato->>'lab_salario_base')::numeric;
  v_real         numeric := (p_contrato->>'lab_salario_real')::numeric;
  v_contrato     record;
  v_actualizados integer;
BEGIN
  IF NOT public.tiene_permiso('HISTORIAL_WRITE') OR v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'No tenés permiso para editar contratos.' USING ERRCODE = '42501';
  END IF;

  IF v_puesto_id IS NULL OR v_tipo_id IS NULL OR v_jornada_id IS NULL
     OR v_sucursal_id IS NULL OR v_base IS NULL OR v_real IS NULL THEN
    RAISE EXCEPTION 'Faltan datos del contrato.' USING ERRCODE = '23514';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('sgrh_contrato'), p_lab_id);

  SELECT lab_fecha_fin, lab_fecha_fin_programada, lab_sucursal_id INTO v_contrato
  FROM public.sgrh_historial_laboral
  WHERE lab_id = p_lab_id AND lab_empresa_id = v_empresa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato no encontrado.' USING ERRCODE = '23503';
  END IF;
  IF v_contrato.lab_fecha_fin IS NOT NULL THEN
    RAISE EXCEPTION 'Solo se puede editar el contrato vigente.' USING ERRCODE = '23514';
  END IF;
  IF v_contrato.lab_fecha_fin_programada IS NOT NULL THEN
    RAISE EXCEPTION 'Este contrato tiene una terminación registrada: revertila antes de editarlo.'
      USING ERRCODE = '23514';
  END IF;

  IF v_base <= 0 OR v_real <= 0 THEN
    RAISE EXCEPTION 'Los salarios tienen que ser mayores a 0.' USING ERRCODE = '23514';
  END IF;

  -- Solo si la sucursal CAMBIA: corregir un salario no tiene por qué esperar a
  -- que se pague la quincena. Mover la base a medio pagar sí parte la planilla
  -- en dos; pagada es limpio, porque lo viejo se queda en los períodos de la
  -- sucursal anterior y de ahí en adelante se paga en la nueva.
  IF v_sucursal_id <> v_contrato.lab_sucursal_id
     AND sgrh_private.tiene_quincena_sin_pagar(p_lab_id) THEN
    RAISE EXCEPTION 'Este contrato tiene una quincena sin pagar: terminá de pagarla antes de cambiarle la sucursal.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.sgrh_cat_puestos
    WHERE pue_id = v_puesto_id AND pue_empresa_id = v_empresa_id AND pue_activo
  ) THEN
    RAISE EXCEPTION 'Puesto inexistente, inactivo o de otra empresa.' USING ERRCODE = '23503';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sgrh_cat_tipos_contrato WHERE tco_id = v_tipo_id) THEN
    RAISE EXCEPTION 'Tipo de contrato inexistente.' USING ERRCODE = '23503';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sgrh_cat_tipos_jornada WHERE tjo_id = v_jornada_id) THEN
    RAISE EXCEPTION 'Tipo de jornada inexistente.' USING ERRCODE = '23503';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.sgrh_sucursales
    WHERE suc_id = v_sucursal_id AND suc_empresa_id = v_empresa_id AND suc_activa
  ) THEN
    RAISE EXCEPTION 'Sucursal inexistente, inactiva o de otra empresa.' USING ERRCODE = '23503';
  END IF;

  -- lab_fecha_inicio NO está en el SET a propósito: aunque llegue en el jsonb,
  -- la columna conserva su valor.
  UPDATE public.sgrh_historial_laboral
  SET lab_puesto_id        = v_puesto_id,
      lab_sucursal_id      = v_sucursal_id,
      lab_tipo_contrato_id = v_tipo_id,
      lab_tipo_jornada_id  = v_jornada_id,
      lab_salario_base     = v_base,
      lab_salario_real     = v_real
  WHERE lab_id = p_lab_id;

  -- Un UPDATE que la RLS filtra no da error: afecta 0 filas.
  GET DIAGNOSTICS v_actualizados = ROW_COUNT;
  IF v_actualizados = 0 THEN
    RAISE EXCEPTION 'No tenés permiso para editar este contrato.' USING ERRCODE = '42501';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.editar_contrato(integer, jsonb) IS
  'Corrige las condiciones del contrato vigente: puesto, sucursal base, tipo, jornada y salarios. No toca la fecha de inicio ni las columnas de salida. Cambiar la sucursal base no mueve la historia (marcas, turnos y períodos llevan su propia sucursal) y se rechaza si hay una quincena sin pagar. Los períodos ya calculados conservan sus montos por la foto en sgrh_nomina_detalle; lo nuevo entra en el próximo.';

-- El COMMENT del baseline (20260101000800) dice que lab_sucursal_id nunca se
-- edita en sitio porque reescribiría la historia. Era cierto antes de SGRH-84,
-- cuando la sucursal del contrato y la del día eran la misma columna.
COMMENT ON COLUMN public.sgrh_historial_laboral.lab_sucursal_id IS
  'Sucursal BASE del contrato: en qué planilla se paga y quién ve el expediente. NO es dónde trabaja la persona cada día — eso es prg_sucursal_id en la programación semanal, que el gerente rota libremente (SGRH-84). Se corrige con editar_contrato mientras no haya una quincena sin pagar; la historia no se mueve con ella.';
