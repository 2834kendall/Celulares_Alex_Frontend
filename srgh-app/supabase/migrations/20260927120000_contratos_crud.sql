-- =====================================================================
-- SGRH-90 — CRUD de contratos (crear, editar, terminar, revertir) y
-- liquidación sobre contratos ya terminados.
-- =====================================================================
-- Terminar un contrato pasa a tener dos pasos con dueños distintos:
--   1. RRHH (HISTORIAL_WRITE) lo termina desde el perfil del empleado.
--   2. Contabilidad (NOMINA_WRITE) lo liquida desde Planilla.
-- Entre uno y otro la terminación se puede revertir. Liquidar es el paso
-- definitivo: recién ahí se borran los turnos posteriores a la salida.
--
-- Todas las RPC son SECURITY INVOKER, igual que registrar_etapa_postulacion:
-- no elevan privilegios (la RLS sigue decidiendo qué filas se ven y se
-- escriben), solo juntan validación y escritura en una sola transacción.
--
-- Serializan por contrato con un advisory lock y no con SELECT ... FOR
-- UPDATE: bajo RLS, FOR UPDATE también exige la policy de UPDATE de
-- sgrh_historial_laboral (HISTORIAL_WRITE), y quien liquida tiene
-- NOMINA_WRITE, no necesariamente HISTORIAL_WRITE. Para esa persona el
-- contrato "no existiría".
--
-- Las comprobaciones de liquidaciones y planilla leen tablas cuya RLS pide
-- NOMINA_READ. Los roles con HISTORIAL_WRITE (ADMIN, RRHH) lo tienen; si
-- algún día se le diera HISTORIAL_WRITE a un rol sin NOMINA_READ, esas
-- comprobaciones verían menos filas de las que hay.
-- =====================================================================

-- ─── 1. Un solo contrato vigente por empleado ───────────────────────────
-- Garantía final contra dos contratos abiertos, aunque dos personas
-- guarden a la vez. Sin ella, planillaData duplicaba a la persona en la
-- planilla (ver cargarEmpleadosDesdeAsistencia.ts).

CREATE UNIQUE INDEX IF NOT EXISTS ux_historial_un_contrato_vigente
  ON public.sgrh_historial_laboral (lab_empleado_id)
  WHERE lab_fecha_fin IS NULL;

COMMENT ON INDEX public.ux_historial_un_contrato_vigente IS
  'Un solo contrato vigente (lab_fecha_fin IS NULL) por empleado. Una terminación programada sigue contando como vigente hasta que el job la cierra.';

-- ─── 2. Terminación programada (preaviso) ───────────────────────────────
-- "Vigente = lab_fecha_fin IS NULL" está repetido en 15 consultas de la app
-- y en tres policies (kiosco y biometría). Poner una fecha de fin futura
-- sacaría a la persona del kiosco, del reconocimiento facial y de la
-- planilla durante su preaviso. Por eso la fecha futura vive aparte y
-- lab_fecha_fin se completa recién cuando el día llega.

ALTER TABLE public.sgrh_historial_laboral
  ADD COLUMN IF NOT EXISTS lab_fecha_fin_programada date;

ALTER TABLE public.sgrh_historial_laboral
  DROP CONSTRAINT IF EXISTS sgrh_his_lab_fecha_fin_programada_check;
ALTER TABLE public.sgrh_historial_laboral
  ADD CONSTRAINT sgrh_his_lab_fecha_fin_programada_check
  CHECK (lab_fecha_fin_programada IS NULL OR lab_fecha_fin_programada >= lab_fecha_inicio);

COMMENT ON COLUMN public.sgrh_historial_laboral.lab_fecha_fin_programada IS
  'Último día trabajado de una salida ya registrada que todavía no llegó (preaviso). Mientras tenga valor, lab_fecha_fin sigue NULL y la persona está vigente para todo el sistema. sgrh_private.cerrar_contratos_programados() la pasa a lab_fecha_fin al día siguiente.';

-- ─── 3. Job de cierre ───────────────────────────────────────────────────
-- Cierra las terminaciones programadas cuyo último día ya pasó. Con "<" y
-- no "<=": el último día la persona todavía puede marcar. Si un día el job
-- no corre, el siguiente cierra todo lo atrasado.
--
-- p_hoy existe solo para poder probarlo sin esperar al día siguiente.

CREATE OR REPLACE FUNCTION sgrh_private.cerrar_contratos_programados(p_hoy date DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_hoy     date := coalesce(p_hoy, (now() AT TIME ZONE 'America/Costa_Rica')::date);
  v_cerrados integer;
BEGIN
  UPDATE public.sgrh_historial_laboral
  SET lab_fecha_fin            = lab_fecha_fin_programada,
      lab_fecha_fin_programada = NULL
  WHERE lab_fecha_fin IS NULL
    AND lab_fecha_fin_programada < v_hoy;

  GET DIAGNOSTICS v_cerrados = ROW_COUNT;
  RETURN v_cerrados;
END;
$$;

-- Solo la corre pg_cron (como postgres). Nadie más la necesita.
REVOKE EXECUTE ON FUNCTION sgrh_private.cerrar_contratos_programados(date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION sgrh_private.cerrar_contratos_programados(date) FROM anon;
REVOKE EXECUTE ON FUNCTION sgrh_private.cerrar_contratos_programados(date) FROM authenticated;

COMMENT ON FUNCTION sgrh_private.cerrar_contratos_programados(date) IS
  'Job diario (pg_cron, seeds/01_sistema/05_jobs.sql): pasa lab_fecha_fin_programada a lab_fecha_fin cuando el último día ya pasó. Devuelve cuántos contratos cerró.';

-- El agendado vive en seeds/01_sistema/05_jobs.sql: es configuración, no
-- forma de la base.
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ─── 4. crear_contrato ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.crear_contrato(p_empleado_id integer, p_contrato jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_empresa_id   integer := public.get_empresa_id();
  v_puesto_id    integer := (p_contrato->>'lab_puesto_id')::integer;
  v_sucursal_id  integer := (p_contrato->>'lab_sucursal_id')::integer;
  v_tipo_id      integer := (p_contrato->>'lab_tipo_contrato_id')::integer;
  v_jornada_id   integer := (p_contrato->>'lab_tipo_jornada_id')::integer;
  v_inicio       date    := (p_contrato->>'lab_fecha_inicio')::date;
  v_base         numeric := (p_contrato->>'lab_salario_base')::numeric;
  v_real         numeric := (p_contrato->>'lab_salario_real')::numeric;
  v_ingreso      date;
  v_ultimo       record;
  v_lab_id       integer;
BEGIN
  IF NOT public.tiene_permiso('HISTORIAL_WRITE') OR v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'No tenés permiso para registrar contratos.' USING ERRCODE = '42501';
  END IF;

  IF v_puesto_id IS NULL OR v_sucursal_id IS NULL OR v_tipo_id IS NULL
     OR v_jornada_id IS NULL OR v_inicio IS NULL OR v_base IS NULL OR v_real IS NULL THEN
    RAISE EXCEPTION 'Faltan datos del contrato.' USING ERRCODE = '23514';
  END IF;

  SELECT emp_fecha_ingreso_original INTO v_ingreso
  FROM public.sgrh_empleados WHERE emp_id = p_empleado_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Empleado no encontrado.' USING ERRCODE = '23503';
  END IF;

  SELECT lab_id, lab_fecha_fin INTO v_ultimo
  FROM public.sgrh_historial_laboral
  WHERE lab_empleado_id = p_empleado_id AND lab_empresa_id = v_empresa_id
  ORDER BY lab_fecha_inicio DESC, lab_id DESC
  LIMIT 1;

  IF FOUND THEN
    IF v_ultimo.lab_fecha_fin IS NULL THEN
      RAISE EXCEPTION 'Este empleado ya tiene un contrato vigente.' USING ERRCODE = '23514';
    END IF;
    -- contratosDeLaRelacion (payroll/lib/derechos.ts) corta la relación
    -- laboral solo en contratos liquidados: sin esta regla, una
    -- recontratación se mezclaría con la relación anterior en vacaciones,
    -- aguinaldo y antigüedad.
    IF NOT EXISTS (
      SELECT 1 FROM public.sgrh_liquidaciones WHERE liq_historial_laboral_id = v_ultimo.lab_id
    ) THEN
      RAISE EXCEPTION 'El contrato anterior todavía está pendiente de liquidar.' USING ERRCODE = '23514';
    END IF;
    IF v_inicio <= v_ultimo.lab_fecha_fin THEN
      RAISE EXCEPTION 'El contrato nuevo tiene que empezar después del anterior, que terminó el %.',
        to_char(v_ultimo.lab_fecha_fin, 'DD/MM/YYYY') USING ERRCODE = '23514';
    END IF;
  END IF;

  IF v_ingreso IS NOT NULL AND v_inicio < v_ingreso THEN
    RAISE EXCEPTION 'El contrato no puede empezar antes del ingreso a la empresa (%).',
      to_char(v_ingreso, 'DD/MM/YYYY') USING ERRCODE = '23514';
  END IF;

  IF v_base <= 0 OR v_real <= 0 THEN
    RAISE EXCEPTION 'Los salarios tienen que ser mayores a 0.' USING ERRCODE = '23514';
  END IF;

  -- Puesto y sucursal tienen dueño: se validan contra la empresa del JWT,
  -- porque la policy de INSERT de sgrh_historial_laboral no lo hace.
  IF NOT EXISTS (
    SELECT 1 FROM public.sgrh_cat_puestos
    WHERE pue_id = v_puesto_id AND pue_empresa_id = v_empresa_id AND pue_activo
  ) THEN
    RAISE EXCEPTION 'Puesto inexistente, inactivo o de otra empresa.' USING ERRCODE = '23503';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.sgrh_sucursales
    WHERE suc_id = v_sucursal_id AND suc_empresa_id = v_empresa_id AND suc_activa
  ) THEN
    RAISE EXCEPTION 'Sucursal inexistente, inactiva o de otra empresa.' USING ERRCODE = '23503';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sgrh_cat_tipos_contrato WHERE tco_id = v_tipo_id) THEN
    RAISE EXCEPTION 'Tipo de contrato inexistente.' USING ERRCODE = '23503';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sgrh_cat_tipos_jornada WHERE tjo_id = v_jornada_id) THEN
    RAISE EXCEPTION 'Tipo de jornada inexistente.' USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.sgrh_historial_laboral (
    lab_empleado_id, lab_empresa_id, lab_sucursal_id, lab_puesto_id,
    lab_tipo_contrato_id, lab_tipo_jornada_id, lab_fecha_inicio,
    lab_salario_base, lab_salario_real
  ) VALUES (
    p_empleado_id, v_empresa_id, v_sucursal_id, v_puesto_id,
    v_tipo_id, v_jornada_id, v_inicio,
    v_base, v_real
  )
  RETURNING lab_id INTO v_lab_id;

  RETURN v_lab_id;
END;
$$;

-- ─── 5. editar_contrato ─────────────────────────────────────────────────
-- Solo el vigente y solo antes de su primera planilla: desde SGRH-83 la
-- planilla lee el salario del contrato en vivo, así que cambiarlo después
-- alteraría cálculos ya hechos. Nunca toca la sucursal (un traslado
-- reescribiría la historia) ni las columnas de salida.

CREATE OR REPLACE FUNCTION public.editar_contrato(p_lab_id integer, p_contrato jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_empresa_id    integer := public.get_empresa_id();
  v_puesto_id     integer := (p_contrato->>'lab_puesto_id')::integer;
  v_tipo_id       integer := (p_contrato->>'lab_tipo_contrato_id')::integer;
  v_jornada_id    integer := (p_contrato->>'lab_tipo_jornada_id')::integer;
  v_inicio        date    := (p_contrato->>'lab_fecha_inicio')::date;
  v_base          numeric := (p_contrato->>'lab_salario_base')::numeric;
  v_real          numeric := (p_contrato->>'lab_salario_real')::numeric;
  v_contrato      record;
  v_ingreso       date;
  v_primera_marca date;
  v_primer_turno  date;
  v_actualizados  integer;
BEGIN
  IF NOT public.tiene_permiso('HISTORIAL_WRITE') OR v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'No tenés permiso para editar contratos.' USING ERRCODE = '42501';
  END IF;

  IF v_puesto_id IS NULL OR v_tipo_id IS NULL OR v_jornada_id IS NULL
     OR v_inicio IS NULL OR v_base IS NULL OR v_real IS NULL THEN
    RAISE EXCEPTION 'Faltan datos del contrato.' USING ERRCODE = '23514';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('sgrh_contrato'), p_lab_id);

  SELECT lab_empleado_id, lab_fecha_fin, lab_fecha_fin_programada INTO v_contrato
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

  IF EXISTS (SELECT 1 FROM public.sgrh_nomina_detalle WHERE ndt_historial_laboral_id = p_lab_id) THEN
    RAISE EXCEPTION 'Este contrato ya pasó por planilla y no se puede editar.' USING ERRCODE = '23514';
  END IF;

  IF v_base <= 0 OR v_real <= 0 THEN
    RAISE EXCEPTION 'Los salarios tienen que ser mayores a 0.' USING ERRCODE = '23514';
  END IF;

  SELECT emp_fecha_ingreso_original INTO v_ingreso
  FROM public.sgrh_empleados WHERE emp_id = v_contrato.lab_empleado_id;
  IF v_ingreso IS NOT NULL AND v_inicio < v_ingreso THEN
    RAISE EXCEPTION 'El contrato no puede empezar antes del ingreso a la empresa (%).',
      to_char(v_ingreso, 'DD/MM/YYYY') USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.sgrh_historial_laboral
    WHERE lab_empleado_id = v_contrato.lab_empleado_id
      AND lab_id <> p_lab_id
      AND lab_fecha_fin >= v_inicio
  ) THEN
    RAISE EXCEPTION 'El contrato no puede empezar antes de que termine el anterior.' USING ERRCODE = '23514';
  END IF;

  -- Mover el inicio más tarde no puede dejar marcas ni turnos antes de su
  -- propio contrato.
  SELECT min(mar_fecha_hora)::date INTO v_primera_marca
  FROM public.sgrh_marcas_asistencia WHERE mar_historial_laboral_id = p_lab_id;
  IF v_primera_marca IS NOT NULL AND v_inicio > v_primera_marca THEN
    RAISE EXCEPTION 'Hay marcas desde el %: el contrato no puede empezar después.',
      to_char(v_primera_marca, 'DD/MM/YYYY') USING ERRCODE = '23514';
  END IF;

  SELECT min(prg_fecha) INTO v_primer_turno
  FROM public.sgrh_programacion_semanal WHERE prg_historial_laboral_id = p_lab_id;
  IF v_primer_turno IS NOT NULL AND v_inicio > v_primer_turno THEN
    RAISE EXCEPTION 'Hay turnos desde el %: el contrato no puede empezar después.',
      to_char(v_primer_turno, 'DD/MM/YYYY') USING ERRCODE = '23514';
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

  UPDATE public.sgrh_historial_laboral
  SET lab_puesto_id        = v_puesto_id,
      lab_tipo_contrato_id = v_tipo_id,
      lab_tipo_jornada_id  = v_jornada_id,
      lab_fecha_inicio     = v_inicio,
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

-- ─── 6. terminar_contrato ───────────────────────────────────────────────
-- p_fecha_fin es el último día trabajado. Si ya pasó, cierra en el acto; si
-- es hoy o futura (preaviso), queda programada y el job la cierra al día
-- siguiente. No borra turnos: la terminación se puede revertir hasta que se
-- liquide, y un turno borrado no se recupera.
--
-- Devuelve true si quedó programada, false si cerró en el acto.

CREATE OR REPLACE FUNCTION public.terminar_contrato(
  p_lab_id         integer,
  p_fecha_fin      date,
  p_motivo_id      integer,
  p_recontratable  boolean,
  p_observaciones  character varying DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_empresa_id   integer := public.get_empresa_id();
  v_hoy          date    := (now() AT TIME ZONE 'America/Costa_Rica')::date;
  v_contrato     record;
  v_programada   boolean;
  v_actualizados integer;
BEGIN
  IF NOT public.tiene_permiso('HISTORIAL_WRITE') OR v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'No tenés permiso para terminar contratos.' USING ERRCODE = '42501';
  END IF;

  IF p_fecha_fin IS NULL OR p_motivo_id IS NULL THEN
    RAISE EXCEPTION 'Faltan la fecha o el motivo de salida.' USING ERRCODE = '23514';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('sgrh_contrato'), p_lab_id);

  SELECT lab_fecha_inicio, lab_fecha_fin, lab_fecha_fin_programada INTO v_contrato
  FROM public.sgrh_historial_laboral
  WHERE lab_id = p_lab_id AND lab_empresa_id = v_empresa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato no encontrado.' USING ERRCODE = '23503';
  END IF;
  IF v_contrato.lab_fecha_fin IS NOT NULL THEN
    RAISE EXCEPTION 'Este contrato ya está terminado.' USING ERRCODE = '23514';
  END IF;
  IF v_contrato.lab_fecha_fin_programada IS NOT NULL THEN
    RAISE EXCEPTION 'Este contrato ya tiene una terminación programada para el %.',
      to_char(v_contrato.lab_fecha_fin_programada, 'DD/MM/YYYY') USING ERRCODE = '23514';
  END IF;
  IF p_fecha_fin < v_contrato.lab_fecha_inicio THEN
    RAISE EXCEPTION 'El último día no puede ser anterior al inicio del contrato (%).',
      to_char(v_contrato.lab_fecha_inicio, 'DD/MM/YYYY') USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.sgrh_cat_motivos_salida WHERE mot_id = p_motivo_id) THEN
    RAISE EXCEPTION 'Motivo de salida inexistente.' USING ERRCODE = '23503';
  END IF;

  v_programada := p_fecha_fin >= v_hoy;

  UPDATE public.sgrh_historial_laboral
  SET lab_fecha_fin            = CASE WHEN v_programada THEN NULL ELSE p_fecha_fin END,
      lab_fecha_fin_programada = CASE WHEN v_programada THEN p_fecha_fin ELSE NULL END,
      lab_motivo_salida_id     = p_motivo_id,
      lab_recontratable        = coalesce(p_recontratable, true),
      lab_observaciones_salida = nullif(btrim(p_observaciones), '')
  WHERE lab_id = p_lab_id;

  GET DIAGNOSTICS v_actualizados = ROW_COUNT;
  IF v_actualizados = 0 THEN
    RAISE EXCEPTION 'No tenés permiso para terminar este contrato.' USING ERRCODE = '42501';
  END IF;

  RETURN v_programada;
END;
$$;

-- ─── 7. revertir_terminacion ────────────────────────────────────────────
-- Deshace una terminación programada, o una ya cerrada que todavía no se
-- liquidó. Como crear_contrato exige el anterior liquidado, un contrato
-- terminado y sin liquidar es siempre el último del empleado: reabrirlo no
-- choca con otro (y si chocara, el índice único lo rechaza).

CREATE OR REPLACE FUNCTION public.revertir_terminacion(p_lab_id integer)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_empresa_id   integer := public.get_empresa_id();
  v_contrato     record;
  v_actualizados integer;
BEGIN
  IF NOT public.tiene_permiso('HISTORIAL_WRITE') OR v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'No tenés permiso para revertir terminaciones.' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('sgrh_contrato'), p_lab_id);

  SELECT lab_empleado_id, lab_fecha_fin, lab_fecha_fin_programada INTO v_contrato
  FROM public.sgrh_historial_laboral
  WHERE lab_id = p_lab_id AND lab_empresa_id = v_empresa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato no encontrado.' USING ERRCODE = '23503';
  END IF;
  IF v_contrato.lab_fecha_fin IS NULL AND v_contrato.lab_fecha_fin_programada IS NULL THEN
    RAISE EXCEPTION 'Este contrato no tiene una terminación registrada.' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sgrh_liquidaciones WHERE liq_historial_laboral_id = p_lab_id) THEN
    RAISE EXCEPTION 'Este contrato ya fue liquidado: la terminación no se puede revertir.'
      USING ERRCODE = '23514';
  END IF;
  IF v_contrato.lab_fecha_fin IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.sgrh_historial_laboral
    WHERE lab_empleado_id = v_contrato.lab_empleado_id
      AND lab_id <> p_lab_id
      AND lab_fecha_fin IS NULL
  ) THEN
    RAISE EXCEPTION 'El empleado ya tiene otro contrato vigente.' USING ERRCODE = '23514';
  END IF;

  UPDATE public.sgrh_historial_laboral
  SET lab_fecha_fin            = NULL,
      lab_fecha_fin_programada = NULL,
      lab_motivo_salida_id     = NULL,
      lab_observaciones_salida = NULL,
      lab_recontratable        = true
  WHERE lab_id = p_lab_id;

  GET DIAGNOSTICS v_actualizados = ROW_COUNT;
  IF v_actualizados = 0 THEN
    RAISE EXCEPTION 'No tenés permiso para revertir esta terminación.' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- ─── 8. registrar_liquidacion ───────────────────────────────────────────
-- El cálculo sigue en TypeScript (payroll/lib/liquidacion.ts y
-- derechos.ts); esto solo valida y persiste. El contrato, la fecha de
-- salida y el motivo salen de la fila del contrato, nunca del payload: el
-- cliente no puede liquidar con otra fecha que la que registró RRHH.
--
-- Liquidar es definitivo, así que recién acá se borran los turnos
-- posteriores a la salida. Ese DELETE pasa por la RLS de la programación:
-- si quien liquida no puede borrar turnos, quedan (no molestan: kiosco y
-- grilla solo miran contratos vigentes).

CREATE OR REPLACE FUNCTION public.registrar_liquidacion(p_lab_id integer, p_liquidacion jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_contrato record;
  v_liq_id   integer;
BEGIN
  IF NOT public.tiene_permiso('NOMINA_WRITE') THEN
    RAISE EXCEPTION 'No tenés permiso para liquidar.' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('sgrh_contrato'), p_lab_id);

  SELECT lab_fecha_fin, lab_motivo_salida_id INTO v_contrato
  FROM public.sgrh_historial_laboral
  WHERE lab_id = p_lab_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato no encontrado.' USING ERRCODE = '23503';
  END IF;
  IF v_contrato.lab_fecha_fin IS NULL THEN
    RAISE EXCEPTION 'Este contrato sigue vigente: primero terminalo desde el perfil del empleado.'
      USING ERRCODE = '23514';
  END IF;
  IF v_contrato.lab_motivo_salida_id IS NULL THEN
    RAISE EXCEPTION 'El contrato no tiene motivo de salida registrado.' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sgrh_liquidaciones WHERE liq_historial_laboral_id = p_lab_id) THEN
    RAISE EXCEPTION 'Ya existe una liquidación guardada para este contrato.' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.sgrh_liquidaciones (
    liq_historial_laboral_id,
    liq_motivo_salida_id,
    liq_fecha_salida,
    liq_salario_diario,
    liq_salario_diario_vacaciones,
    liq_dias_trabajados_mes,
    liq_salario_proporcional,
    liq_aguinaldo_proporcional,
    liq_dias_vacaciones_pendientes,
    liq_dias_vacaciones_propuestos,
    liq_vacaciones_pagadas,
    liq_dias_preaviso,
    liq_preaviso,
    liq_dias_cesantia,
    liq_cesantia,
    liq_total,
    liq_deducciones_obreras,
    liq_neto,
    liq_observaciones
  ) VALUES (
    p_lab_id,
    v_contrato.lab_motivo_salida_id,
    v_contrato.lab_fecha_fin,
    (p_liquidacion->>'liq_salario_diario')::numeric,
    (p_liquidacion->>'liq_salario_diario_vacaciones')::numeric,
    (p_liquidacion->>'liq_dias_trabajados_mes')::numeric,
    (p_liquidacion->>'liq_salario_proporcional')::numeric,
    (p_liquidacion->>'liq_aguinaldo_proporcional')::numeric,
    (p_liquidacion->>'liq_dias_vacaciones_pendientes')::numeric,
    (p_liquidacion->>'liq_dias_vacaciones_propuestos')::numeric,
    (p_liquidacion->>'liq_vacaciones_pagadas')::numeric,
    (p_liquidacion->>'liq_dias_preaviso')::numeric,
    (p_liquidacion->>'liq_preaviso')::numeric,
    (p_liquidacion->>'liq_dias_cesantia')::numeric,
    (p_liquidacion->>'liq_cesantia')::numeric,
    (p_liquidacion->>'liq_total')::numeric,
    (p_liquidacion->>'liq_deducciones_obreras')::numeric,
    (p_liquidacion->>'liq_neto')::numeric,
    p_liquidacion->>'liq_observaciones'
  )
  RETURNING liq_id INTO v_liq_id;

  DELETE FROM public.sgrh_programacion_semanal
  WHERE prg_historial_laboral_id = p_lab_id
    AND prg_fecha > v_contrato.lab_fecha_fin;

  RETURN v_liq_id;
END;
$$;

-- ─── 9. Permisos y documentación de las RPC ─────────────────────────────

REVOKE EXECUTE ON FUNCTION public.crear_contrato(integer, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.crear_contrato(integer, jsonb) FROM anon;
GRANT  EXECUTE ON FUNCTION public.crear_contrato(integer, jsonb) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.editar_contrato(integer, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.editar_contrato(integer, jsonb) FROM anon;
GRANT  EXECUTE ON FUNCTION public.editar_contrato(integer, jsonb) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.terminar_contrato(integer, date, integer, boolean, character varying) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.terminar_contrato(integer, date, integer, boolean, character varying) FROM anon;
GRANT  EXECUTE ON FUNCTION public.terminar_contrato(integer, date, integer, boolean, character varying) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.revertir_terminacion(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.revertir_terminacion(integer) FROM anon;
GRANT  EXECUTE ON FUNCTION public.revertir_terminacion(integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.registrar_liquidacion(integer, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.registrar_liquidacion(integer, jsonb) FROM anon;
GRANT  EXECUTE ON FUNCTION public.registrar_liquidacion(integer, jsonb) TO authenticated;

COMMENT ON FUNCTION public.crear_contrato(integer, jsonb) IS
  'Nuevo contrato para un empleado sin contrato vigente y con el anterior ya liquidado. SECURITY INVOKER: exige HISTORIAL_WRITE y valida puesto y sucursal contra la empresa del JWT.';
COMMENT ON FUNCTION public.editar_contrato(integer, jsonb) IS
  'Corrige el contrato vigente mientras no haya pasado por planilla. Nunca toca la sucursal ni las columnas de salida.';
COMMENT ON FUNCTION public.terminar_contrato(integer, date, integer, boolean, character varying) IS
  'Termina el contrato vigente: cierra en el acto si el último día ya pasó, o lo deja programado (preaviso). Devuelve true si quedó programado.';
COMMENT ON FUNCTION public.revertir_terminacion(integer) IS
  'Deshace una terminación programada, o una cerrada que todavía no se liquidó.';
COMMENT ON FUNCTION public.registrar_liquidacion(integer, jsonb) IS
  'Guarda la liquidación de un contrato ya terminado (montos calculados en TypeScript; contrato, fecha y motivo salen de la fila) y borra los turnos posteriores a la salida.';

NOTIFY pgrst, 'reload schema';
