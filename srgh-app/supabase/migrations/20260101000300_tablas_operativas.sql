-- =====================================================================
-- SGRH — Baseline: tablas operativas
-- =====================================================================
-- Asistencia, ausencias, nómina, comisiones, reclutamiento, evaluaciones,
-- notificaciones, biometría y documentos.
--
-- Casi todas cuelgan de sgrh_historial_laboral (creada en 20260101000200),
-- que es de dónde sale la pertenencia a la empresa para la RLS.
-- =====================================================================

-- ─── 1. Asistencia ──────────────────────────────────────────────────────────
-- Deliberadamente SIN CHECK sobre mar_tipo: el vocabulario de tipos de marca
-- se valida en la aplicación (Zod) para poder evolucionarlo sin migración.

CREATE TABLE IF NOT EXISTS public.sgrh_marcas_asistencia (
  mar_id                        integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mar_historial_laboral_id      integer NOT NULL,
  mar_sucursal_id               integer NOT NULL,
  mar_tipo                      character varying NOT NULL,
  mar_fecha_hora                timestamp without time zone NOT NULL,
  mar_latitud_marcada           numeric,
  mar_longitud_marcada          numeric,
  mar_distancia_geocerca_metros numeric,
  mar_metodo_verificacion       character varying NOT NULL CHECK (mar_metodo_verificacion::text = ANY (ARRAY['FACIAL'::text, 'MANUAL'::text])),
  mar_dispositivo_id            character varying,
  mar_registrado_por_id         integer,
  mar_observacion               character varying,
  mar_created_at                timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT sgrh_asi_mar_historial_laboral_id_fkey FOREIGN KEY (mar_historial_laboral_id) REFERENCES public.sgrh_historial_laboral(lab_id),
  CONSTRAINT sgrh_asi_mar_sucursal_id_fkey         FOREIGN KEY (mar_sucursal_id)          REFERENCES public.sgrh_sucursales(suc_id),
  CONSTRAINT sgrh_asi_mar_registrado_por_id_fkey   FOREIGN KEY (mar_registrado_por_id)    REFERENCES public.sgrh_usuarios(usr_id)
);

-- Panel del gerente: marcas de una sucursal en un rango de fechas.
CREATE INDEX IF NOT EXISTS idx_marcas_sucursal_fecha
  ON public.sgrh_marcas_asistencia (mar_sucursal_id, mar_fecha_hora);

-- Historial del empleado: marcas de un contrato en un rango de fechas.
CREATE INDEX IF NOT EXISTS idx_marcas_historial_fecha
  ON public.sgrh_marcas_asistencia (mar_historial_laboral_id, mar_fecha_hora);

-- Las columnas *_custom permiten sobreescribir puntualmente el horario del
-- catálogo para un día concreto sin crear un horario nuevo.
CREATE TABLE IF NOT EXISTS public.sgrh_programacion_semanal (
  prg_id                          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  prg_empleado_id                 integer NOT NULL,
  prg_sucursal_id                 integer NOT NULL,
  prg_historial_laboral_id        integer NOT NULL,
  prg_horario_id                  integer,
  prg_fecha                       date NOT NULL,
  prg_es_dia_libre                boolean NOT NULL DEFAULT false,
  prg_es_feriado                  boolean NOT NULL DEFAULT false,
  prg_es_apertura                 boolean NOT NULL DEFAULT false,
  prg_es_cierre                   boolean NOT NULL DEFAULT false,
  prg_creado_por_id               integer,
  prg_observaciones               character varying,
  prg_hora_entrada_custom         time without time zone,
  prg_hora_salida_custom          time without time zone,
  prg_hora_inicio_almuerzo_custom time without time zone,
  prg_hora_fin_almuerzo_custom    time without time zone,
  prg_hora_inicio_break_custom    time without time zone,
  prg_hora_fin_break_custom       time without time zone,
  CONSTRAINT sgrh_asi_prg_empleado_id_fkey         FOREIGN KEY (prg_empleado_id)          REFERENCES public.sgrh_empleados(emp_id),
  CONSTRAINT sgrh_asi_prg_sucursal_id_fkey         FOREIGN KEY (prg_sucursal_id)          REFERENCES public.sgrh_sucursales(suc_id),
  CONSTRAINT sgrh_asi_prg_historial_laboral_id_fkey FOREIGN KEY (prg_historial_laboral_id) REFERENCES public.sgrh_historial_laboral(lab_id),
  CONSTRAINT sgrh_asi_prg_horario_id_fkey          FOREIGN KEY (prg_horario_id)           REFERENCES public.sgrh_cat_horarios(hor_id),
  CONSTRAINT sgrh_asi_prg_creado_por_id_fkey       FOREIGN KEY (prg_creado_por_id)        REFERENCES public.sgrh_empleados(emp_id)
);

-- ─── 2. Ausencias ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sgrh_ausencias (
  aus_id                   integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  aus_historial_laboral_id integer NOT NULL,
  aus_tipo_ausencia_id     integer NOT NULL,
  aus_fecha_inicio         date NOT NULL,
  aus_fecha_fin            date NOT NULL,
  aus_dias_habiles         numeric,
  aus_dias_naturales       numeric,
  aus_estado               character varying NOT NULL DEFAULT 'pendiente'::character varying,
  aus_aprobado_por_id      integer,
  aus_fecha_aprobacion     timestamp without time zone,
  aus_motivo_rechazo       character varying,
  aus_numero_boleta_ccss   character varying,
  aus_documento_url        character varying,
  aus_dias_paga_empleador  numeric NOT NULL DEFAULT 0,
  aus_dias_paga_ccss       numeric NOT NULL DEFAULT 0,
  aus_dias_sin_goce        numeric NOT NULL DEFAULT 0,
  aus_observaciones        character varying,
  aus_created_at           timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT sgrh_asi_aus_historial_laboral_id_fkey FOREIGN KEY (aus_historial_laboral_id) REFERENCES public.sgrh_historial_laboral(lab_id),
  CONSTRAINT sgrh_asi_aus_tipo_ausencia_id_fkey     FOREIGN KEY (aus_tipo_ausencia_id)     REFERENCES public.sgrh_cat_tipos_ausencia(tau_id),
  CONSTRAINT sgrh_asi_aus_aprobado_por_id_fkey      FOREIGN KEY (aus_aprobado_por_id)      REFERENCES public.sgrh_usuarios(usr_id)
);

-- ─── 3. Beneficios (va antes de nómina: las deducciones lo referencian) ─────

CREATE TABLE IF NOT EXISTS public.sgrh_beneficios_empleado (
  ben_id                   integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ben_historial_laboral_id integer NOT NULL,
  ben_descripcion          character varying NOT NULL,
  ben_monto_total          numeric NOT NULL,
  ben_monto_deducido       numeric NOT NULL DEFAULT 0,
  ben_cuotas_pactadas      integer,
  ben_cuota_mensual        numeric,
  ben_fecha_inicio         date NOT NULL,
  ben_fecha_fin_estimada   date,
  ben_activo               boolean NOT NULL DEFAULT true,
  ben_observaciones        character varying,
  ben_created_at           timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT sgrh_his_ben_historial_laboral_id_fkey FOREIGN KEY (ben_historial_laboral_id) REFERENCES public.sgrh_historial_laboral(lab_id)
);

-- ─── 4. Nómina ──────────────────────────────────────────────────────────────
-- npe_estado tiene solo dos valores en uso: 'borrador' y 'pagado'. La
-- aplicación lo recalcula sola cada vez que se marca/desmarca el pago de un
-- empleado (sincronizarEstadoPeriodo en marcarDetallePagado.ts): pasa a
-- 'pagado' cuando TODOS quedan pagados, y vuelve a 'borrador' si se desmarca
-- alguno. Sin CHECK, igual que en el remoto.

CREATE TABLE IF NOT EXISTS public.sgrh_nomina_periodo (
  npe_id                  integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  npe_empresa_id          integer NOT NULL,
  npe_sucursal_id         integer NOT NULL,
  npe_periodo_mes         smallint NOT NULL,
  npe_periodo_anio        integer NOT NULL,
  npe_quincena            smallint NOT NULL DEFAULT 1,
  npe_fecha_inicio_periodo date,
  npe_fecha_fin_periodo   date,
  npe_estado              character varying NOT NULL DEFAULT 'borrador'::character varying,
  npe_aprobado_por_id     integer,
  npe_fecha_aprobacion    timestamp without time zone,
  npe_fecha_pago          date,
  npe_observaciones       character varying,
  npe_created_at          timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT sgrh_nom_per_empresa_id_fkey     FOREIGN KEY (npe_empresa_id)      REFERENCES public.sgrh_empresas(org_id),
  CONSTRAINT sgrh_nom_per_sucursal_id_fkey    FOREIGN KEY (npe_sucursal_id)     REFERENCES public.sgrh_sucursales(suc_id),
  CONSTRAINT sgrh_nom_per_aprobado_por_id_fkey FOREIGN KEY (npe_aprobado_por_id) REFERENCES public.sgrh_usuarios(usr_id)
);

-- Sin esto, createPeriodo() puede crear dos "Julio 2026 · 1ra quincena" para
-- la misma sucursal sin que la app lo detecte.
CREATE UNIQUE INDEX IF NOT EXISTS sgrh_nomina_periodo_unico
  ON public.sgrh_nomina_periodo (npe_sucursal_id, npe_periodo_anio, npe_periodo_mes, npe_quincena);

CREATE TABLE IF NOT EXISTS public.sgrh_nomina_detalle (
  ndt_id                         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ndt_nomina_periodo_id          integer NOT NULL,
  ndt_historial_laboral_id       integer NOT NULL,
  ndt_horas_ordinarias_diurnas   numeric NOT NULL DEFAULT 0,
  ndt_horas_ordinarias_nocturnas numeric NOT NULL DEFAULT 0,
  ndt_horas_ordinarias_mixtas    numeric NOT NULL DEFAULT 0,
  ndt_horas_extra_al_50          numeric NOT NULL DEFAULT 0,
  ndt_horas_extra_al_75          numeric NOT NULL DEFAULT 0,
  ndt_dias_ausencia_sin_goce     numeric NOT NULL DEFAULT 0,
  ndt_dias_incapacidad_ccss      numeric NOT NULL DEFAULT 0,
  ndt_dias_incapacidad_empleador numeric NOT NULL DEFAULT 0,
  ndt_salario_bruto              numeric NOT NULL DEFAULT 0,
  ndt_total_deducciones_obreras  numeric NOT NULL DEFAULT 0,
  ndt_total_cargas_patronales    numeric NOT NULL DEFAULT 0,
  ndt_salario_neto               numeric NOT NULL DEFAULT 0,
  ndt_pagado                     boolean NOT NULL DEFAULT false,
  ndt_fecha_pago                 date,
  ndt_fecha_registro             date NOT NULL,
  ndt_created_at                 timestamp without time zone NOT NULL DEFAULT now(),
  -- Necesario para calcular horas extra automáticas por empleado por periodo.
  ndt_salario_por_hora           numeric NOT NULL DEFAULT 0,
  CONSTRAINT sgrh_nom_det_nomina_periodo_id_fkey   FOREIGN KEY (ndt_nomina_periodo_id)    REFERENCES public.sgrh_nomina_periodo(npe_id),
  CONSTRAINT sgrh_nom_det_historial_laboral_id_fkey FOREIGN KEY (ndt_historial_laboral_id) REFERENCES public.sgrh_historial_laboral(lab_id)
);

CREATE TABLE IF NOT EXISTS public.sgrh_nomina_linea_ingreso (
  ing_id                integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ing_nomina_detalle_id integer NOT NULL,
  ing_concepto_id       integer NOT NULL,
  ing_cantidad          numeric,
  ing_tarifa_unitaria   numeric,
  ing_monto             numeric NOT NULL,
  ing_observacion       character varying,
  CONSTRAINT sgrh_nom_lin_ing_nomina_detalle_id_fkey FOREIGN KEY (ing_nomina_detalle_id) REFERENCES public.sgrh_nomina_detalle(ndt_id),
  CONSTRAINT sgrh_nom_lin_ing_concepto_id_fkey       FOREIGN KEY (ing_concepto_id)       REFERENCES public.sgrh_cat_conceptos_nomina(con_id)
);

CREATE TABLE IF NOT EXISTS public.sgrh_nomina_linea_deduccion (
  ded_id                  integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ded_nomina_detalle_id   integer NOT NULL,
  ded_concepto_id         integer NOT NULL,
  ded_porcentaje_aplicado numeric,
  ded_base_calculo        numeric,
  ded_monto               numeric NOT NULL,
  ded_es_voluntaria       boolean NOT NULL DEFAULT false,
  ded_beneficio_id        integer,
  ded_observacion         character varying,
  CONSTRAINT sgrh_nom_lin_ded_nomina_detalle_id_fkey FOREIGN KEY (ded_nomina_detalle_id) REFERENCES public.sgrh_nomina_detalle(ndt_id),
  CONSTRAINT sgrh_nom_lin_ded_concepto_id_fkey       FOREIGN KEY (ded_concepto_id)       REFERENCES public.sgrh_cat_conceptos_nomina(con_id),
  CONSTRAINT sgrh_nom_lin_ded_beneficio_id_fkey      FOREIGN KEY (ded_beneficio_id)      REFERENCES public.sgrh_beneficios_empleado(ben_id)
);

CREATE TABLE IF NOT EXISTS public.sgrh_nomina_linea_patronal (
  pat_id                  integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pat_nomina_detalle_id   integer NOT NULL,
  pat_concepto_id         integer NOT NULL,
  pat_porcentaje_aplicado numeric,
  pat_base_calculo        numeric,
  pat_monto               numeric NOT NULL,
  CONSTRAINT sgrh_nom_lin_pat_nomina_detalle_id_fkey FOREIGN KEY (pat_nomina_detalle_id) REFERENCES public.sgrh_nomina_detalle(ndt_id),
  CONSTRAINT sgrh_nom_lin_pat_concepto_id_fkey       FOREIGN KEY (pat_concepto_id)       REFERENCES public.sgrh_cat_conceptos_nomina(con_id)
);

CREATE TABLE IF NOT EXISTS public.sgrh_comprobantes_pago (
  com_id                       integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  com_nomina_detalle_id        integer NOT NULL,
  com_codigo_verificacion      character varying NOT NULL UNIQUE,
  com_fecha_emision            timestamp without time zone NOT NULL DEFAULT now(),
  com_metodo_pago              character varying,
  com_referencia_bancaria      character varying,
  com_confirmado_por_empleado  boolean NOT NULL DEFAULT false,
  com_fecha_confirmacion       timestamp without time zone,
  CONSTRAINT sgrh_nom_com_nomina_detalle_id_fkey FOREIGN KEY (com_nomina_detalle_id) REFERENCES public.sgrh_nomina_detalle(ndt_id)
);

-- Banco de horas: las horas por encima del tope quincenal quedan pendientes
-- aquí en vez de pagarse automáticamente, y el encargado de nómina decide si
-- pagarlas o compensarlas.
CREATE TABLE IF NOT EXISTS public.sgrh_banco_horas_movimientos (
  bhm_id                     integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bhm_historial_laboral_id   integer NOT NULL REFERENCES public.sgrh_historial_laboral (lab_id),
  -- Periodo/detalle donde se generaron estas horas extra.
  bhm_nomina_detalle_id      integer NOT NULL UNIQUE REFERENCES public.sgrh_nomina_detalle (ndt_id),
  bhm_horas                  numeric NOT NULL CHECK (bhm_horas > 0),
  -- Salario por hora de ese periodo, guardado aparte para que el monto
  -- sugerido no cambie si el salario del empleado se actualiza después.
  bhm_salario_por_hora       numeric NOT NULL DEFAULT 0,
  bhm_estado                 text NOT NULL DEFAULT 'pendiente' CHECK (
    bhm_estado IN ('pendiente', 'pagado', 'compensado')
  ),
  bhm_monto_pagado           numeric,
  -- Periodo/detalle donde se aplicó el pago (solo si bhm_estado = 'pagado').
  bhm_nomina_detalle_pago_id integer REFERENCES public.sgrh_nomina_detalle (ndt_id),
  bhm_resuelto_por_id        integer REFERENCES public.sgrh_usuarios (usr_id),
  bhm_fecha_resolucion       timestamp without time zone,
  bhm_created_at             timestamp without time zone NOT NULL DEFAULT now()
);

-- Liquidaciones (finiquitos): un registro auditable por cada liquidación, con
-- el desglose completo. No se puede procesar dos veces la misma asignación
-- laboral (liq_historial_laboral_id es único).
CREATE TABLE IF NOT EXISTS public.sgrh_liquidaciones (
  liq_id                         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  liq_historial_laboral_id       integer NOT NULL UNIQUE REFERENCES public.sgrh_historial_laboral (lab_id),
  liq_motivo_salida_id           integer NOT NULL REFERENCES public.sgrh_cat_motivos_salida (mot_id),
  liq_fecha_salida               date NOT NULL,
  liq_salario_diario             numeric NOT NULL,
  liq_dias_trabajados_mes        numeric NOT NULL DEFAULT 0,
  liq_salario_proporcional       numeric NOT NULL DEFAULT 0,
  liq_aguinaldo_proporcional     numeric NOT NULL DEFAULT 0,
  liq_dias_vacaciones_pendientes numeric NOT NULL DEFAULT 0,
  liq_vacaciones_pagadas         numeric NOT NULL DEFAULT 0,
  liq_dias_preaviso              numeric NOT NULL DEFAULT 0,
  liq_preaviso                   numeric NOT NULL DEFAULT 0,
  liq_dias_cesantia              numeric NOT NULL DEFAULT 0,
  liq_cesantia                   numeric NOT NULL DEFAULT 0,
  liq_total                      numeric NOT NULL DEFAULT 0,
  liq_pagado                     boolean NOT NULL DEFAULT false,
  liq_fecha_pago                 date,
  liq_observaciones              text,
  liq_created_at                 timestamp without time zone NOT NULL DEFAULT now()
);

-- ─── 5. Comisiones y provisiones ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sgrh_comisiones_calculadas (
  cal_id                   integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cal_historial_laboral_id integer NOT NULL,
  cal_periodo_mes          smallint NOT NULL,
  cal_periodo_anio         integer NOT NULL,
  cal_quincena             smallint NOT NULL,
  cal_nivel_comision_id    integer,
  cal_monto_comision       numeric NOT NULL,
  cal_nomina_detalle_id    integer,
  cal_observacion          character varying,
  cal_registrado_por       integer NOT NULL,
  cal_created_at           timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT sgrh_com_cal_historial_laboral_id_fkey FOREIGN KEY (cal_historial_laboral_id) REFERENCES public.sgrh_historial_laboral(lab_id),
  CONSTRAINT sgrh_com_cal_nivel_comision_id_fkey    FOREIGN KEY (cal_nivel_comision_id)    REFERENCES public.sgrh_cat_niveles_comision(nvc_id),
  CONSTRAINT sgrh_com_cal_nomina_detalle_id_fkey    FOREIGN KEY (cal_nomina_detalle_id)    REFERENCES public.sgrh_nomina_detalle(ndt_id),
  CONSTRAINT sgrh_com_cal_registrado_por_fkey       FOREIGN KEY (cal_registrado_por)       REFERENCES public.sgrh_usuarios(usr_id)
);

CREATE TABLE IF NOT EXISTS public.sgrh_provisiones_anuales (
  pra_id                        integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pra_historial_laboral_id      integer NOT NULL,
  pra_anio                      integer NOT NULL,
  pra_monto_acumulado_aguinaldo numeric NOT NULL DEFAULT 0,
  pra_aguinaldo_pagado          boolean NOT NULL DEFAULT false,
  pra_fecha_pago_aguinaldo      date,
  pra_monto_acumulado_cesantia  numeric NOT NULL DEFAULT 0,
  pra_anios_servicio_al_cierre  numeric,
  pra_dias_vacaciones_ganados   numeric NOT NULL DEFAULT 0,
  pra_dias_vacaciones_usados    numeric NOT NULL DEFAULT 0,
  -- Saldo de vacaciones. Es dato DERIVADO (ganados − usados) pero la mantiene
  -- la aplicación, no la base.
  --
  -- El export de esquema del que salió este baseline la mostraba como
  --   DEFAULT (pra_dias_vacaciones_ganados - pra_dias_vacaciones_usados)
  -- que Postgres rechaza: un DEFAULT no puede referenciar otras columnas
  -- (0A000). Era un artefacto del exportador, no el esquema real — en el
  -- proyecto original la columna es un numeric común y escribible (en
  -- database.types.ts aparece en Insert/Update, no como `never`, que es como
  -- se marcan las generadas).
  --
  -- Si algún día se quiere que la calcule la base, lo correcto es
  --   GENERATED ALWAYS AS (...) STORED
  -- pero eso la vuelve de solo lectura y hay que regenerar los tipos.
  pra_dias_vacaciones_disponibles numeric,
  pra_updated_at                timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT sgrh_prv_anu_historial_laboral_id_fkey FOREIGN KEY (pra_historial_laboral_id) REFERENCES public.sgrh_historial_laboral(lab_id)
);

-- ─── 6. Reclutamiento ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sgrh_candidatos (
  cdt_id                     integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cdt_tipo_identificacion_id integer,
  cdt_numero_identificacion  character varying,
  cdt_nombre                 character varying NOT NULL,
  cdt_apellido_1             character varying NOT NULL,
  cdt_apellido_2             character varying,
  cdt_email                  character varying NOT NULL,
  cdt_telefono               character varying,
  cdt_cv_url                 character varying,
  cdt_fuente_reclutamiento   character varying,
  cdt_created_at             timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT sgrh_rec_cdt_tipo_identificacion_id_fkey FOREIGN KEY (cdt_tipo_identificacion_id) REFERENCES public.sgrh_cat_tipos_identificacion(tid_id)
);

CREATE TABLE IF NOT EXISTS public.sgrh_postulaciones (
  pos_id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pos_candidato_id  integer NOT NULL,
  pos_puesto_id     integer NOT NULL,
  pos_empresa_id    integer NOT NULL,
  pos_sucursal_id   integer,
  pos_fecha_postula date NOT NULL DEFAULT now(),
  pos_estado_final  character varying NOT NULL DEFAULT 'en_proceso'::character varying,
  pos_observaciones character varying,
  pos_created_at    timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT sgrh_rec_pos_candidato_id_fkey FOREIGN KEY (pos_candidato_id) REFERENCES public.sgrh_candidatos(cdt_id),
  CONSTRAINT sgrh_rec_pos_puesto_id_fkey    FOREIGN KEY (pos_puesto_id)    REFERENCES public.sgrh_cat_puestos(pue_id),
  CONSTRAINT sgrh_rec_pos_empresa_id_fkey   FOREIGN KEY (pos_empresa_id)   REFERENCES public.sgrh_empresas(org_id),
  CONSTRAINT sgrh_rec_pos_sucursal_id_fkey  FOREIGN KEY (pos_sucursal_id)  REFERENCES public.sgrh_sucursales(suc_id)
);

CREATE TABLE IF NOT EXISTS public.sgrh_postulacion_etapas (
  pet_id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pet_postulacion_id integer NOT NULL,
  pet_etapa_id       integer NOT NULL,
  pet_fecha          date NOT NULL,
  pet_responsable_id integer,
  pet_resultado      character varying,
  pet_notas          character varying,
  pet_created_at     timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT sgrh_rec_pet_postulacion_id_fkey FOREIGN KEY (pet_postulacion_id) REFERENCES public.sgrh_postulaciones(pos_id),
  CONSTRAINT sgrh_rec_pet_etapa_id_fkey       FOREIGN KEY (pet_etapa_id)       REFERENCES public.sgrh_cat_etapas_seleccion(eta_id),
  CONSTRAINT sgrh_rec_pet_responsable_id_fkey FOREIGN KEY (pet_responsable_id) REFERENCES public.sgrh_usuarios(usr_id)
);

-- ─── 7. Evaluaciones de desempeño ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sgrh_evaluaciones (
  eve_id                   integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  eve_empresa_id           integer NOT NULL,
  eve_tipo_evaluacion      character varying NOT NULL,
  eve_historial_laboral_id integer,
  eve_sucursal_id          integer,
  eve_evaluador_id         integer NOT NULL,
  eve_fecha_evaluacion     date NOT NULL,
  eve_tipo_periodo         character varying NOT NULL,
  eve_estado               character varying NOT NULL DEFAULT 'borrador'::character varying,
  eve_promedio_final       numeric,
  eve_resultado_texto      character varying,
  eve_observaciones        character varying,
  eve_created_at           timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT sgrh_eva_enc_empresa_id_fkey           FOREIGN KEY (eve_empresa_id)           REFERENCES public.sgrh_empresas(org_id),
  CONSTRAINT sgrh_eva_enc_historial_laboral_id_fkey FOREIGN KEY (eve_historial_laboral_id) REFERENCES public.sgrh_historial_laboral(lab_id),
  CONSTRAINT sgrh_eva_enc_sucursal_id_fkey          FOREIGN KEY (eve_sucursal_id)          REFERENCES public.sgrh_sucursales(suc_id),
  CONSTRAINT sgrh_eva_enc_evaluador_id_fkey         FOREIGN KEY (eve_evaluador_id)         REFERENCES public.sgrh_usuarios(usr_id)
);

CREATE TABLE IF NOT EXISTS public.sgrh_evaluacion_resultados (
  evr_id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  evr_evaluacion_id integer NOT NULL,
  evr_criterio_id   integer NOT NULL,
  evr_puntaje       numeric,
  evr_observacion   character varying,
  evr_no_aplica     boolean NOT NULL DEFAULT false,
  CONSTRAINT sgrh_eva_res_evaluacion_id_fkey FOREIGN KEY (evr_evaluacion_id) REFERENCES public.sgrh_evaluaciones(eve_id),
  CONSTRAINT sgrh_eva_res_criterio_id_fkey   FOREIGN KEY (evr_criterio_id)   REFERENCES public.sgrh_cat_criterios_evaluacion(cri_id)
);

-- ─── 8. Notificaciones ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sgrh_notificaciones (
  ntf_id                integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ntf_usuario_id        integer,
  ntf_empleado_id       integer,
  ntf_empresa_id        integer,
  ntf_tipo_notificacion character varying NOT NULL CHECK (ntf_tipo_notificacion::text = ANY (ARRAY['cumpleanos'::text, 'vencimiento'::text, 'ausencia_aprobada'::text, 'ausencia_rechazada'::text, 'pago_nomina'::text, 'evaluacion'::text, 'advertencia'::text, 'informacion'::text, 'cambio_horario'::text])),
  ntf_canal             character varying NOT NULL,
  ntf_titulo            character varying NOT NULL,
  ntf_mensaje           character varying NOT NULL,
  ntf_url_accion        character varying,
  ntf_estado            character varying NOT NULL DEFAULT 'pendiente'::character varying,
  ntf_leida             boolean NOT NULL DEFAULT false,
  ntf_fecha_lectura     timestamp without time zone,
  ntf_fecha_envio       timestamp without time zone,
  ntf_intentos          smallint NOT NULL DEFAULT 0,
  ntf_created_at        timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT sgrh_not_ntf_usuario_id_fkey  FOREIGN KEY (ntf_usuario_id)  REFERENCES public.sgrh_usuarios(usr_id),
  CONSTRAINT sgrh_not_ntf_empleado_id_fkey FOREIGN KEY (ntf_empleado_id) REFERENCES public.sgrh_empleados(emp_id),
  CONSTRAINT sgrh_not_ntf_empresa_id_fkey  FOREIGN KEY (ntf_empresa_id)  REFERENCES public.sgrh_empresas(org_id)
);

-- ─── 9. Biometría facial ────────────────────────────────────────────────────
-- bio_empresa_id se denormaliza porque sgrh_empleados no tiene columna de
-- empresa y la RLS del kiosco necesita filtrar sin pasar por historial.

CREATE TABLE IF NOT EXISTS public.sgrh_biometria_empleado (
  bio_id          serial PRIMARY KEY,
  bio_empleado_id int NOT NULL UNIQUE REFERENCES public.sgrh_empleados(emp_id) ON DELETE CASCADE,
  bio_empresa_id  int NOT NULL REFERENCES public.sgrh_empresas(org_id),
  -- Embedding L2-normalizado. El largo depende del modelo; se valida en la
  -- aplicación, no acá (mismo criterio que mar_tipo).
  bio_vector      jsonb NOT NULL,
  -- Comparar vectores de modelos distintos no tiene sentido matemático, así
  -- que la app filtra por esto.
  bio_modelo      varchar(50) NOT NULL DEFAULT 'mobilefacenet-v1',
  bio_creado_por  int REFERENCES public.sgrh_usuarios(usr_id),
  bio_created_at  timestamp NOT NULL DEFAULT now(),
  bio_updated_at  timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sgrh_biometria_auditoria (
  bia_id                serial PRIMARY KEY,
  bia_empresa_id        int NOT NULL REFERENCES public.sgrh_empresas(org_id),
  bia_sucursal_id       int REFERENCES public.sgrh_sucursales(suc_id),
  bia_resultado         varchar(20) NOT NULL,
  bia_mejor_distancia   numeric(6,4),
  bia_mejor_empleado_id int REFERENCES public.sgrh_empleados(emp_id),
  bia_dispositivo_id    varchar(100),
  bia_created_at        timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_biometria_auditoria_empresa_fecha
  ON public.sgrh_biometria_auditoria (bia_empresa_id, bia_created_at);

-- ─── 10. Documentos del expediente ──────────────────────────────────────────
-- doc_empresa_id se denormaliza por la misma razón que en biometría, y porque
-- el primer segmento del path del bucket (para la RLS de storage.objects) es
-- justamente <empresa_id>/.

CREATE TABLE IF NOT EXISTS public.sgrh_documentos (
  doc_id                serial PRIMARY KEY,
  doc_empresa_id        int NOT NULL REFERENCES public.sgrh_empresas(org_id),
  doc_empleado_id       int NOT NULL REFERENCES public.sgrh_empleados(emp_id) ON DELETE CASCADE,
  doc_tipo_id           int NOT NULL REFERENCES public.sgrh_cat_tipos_documento(tdo_id),
  doc_nombre            varchar(150) NOT NULL,
  doc_descripcion       varchar(300),
  doc_fecha_vencimiento date,
  -- Ruta en el bucket documentos-empleados:
  -- <empresa_id>/empleados/<emp_id>/<uuid>.<ext>. NUNCA se expone al cliente.
  doc_path              text NOT NULL UNIQUE,
  -- MIME real detectado por magic bytes en el servidor (validateUpload),
  -- nunca el file.type que declara el cliente.
  doc_mime              varchar(100) NOT NULL,
  doc_creado_por        int REFERENCES public.sgrh_usuarios(usr_id),
  doc_created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documentos_empleado ON public.sgrh_documentos (doc_empleado_id);
CREATE INDEX IF NOT EXISTS idx_documentos_empresa  ON public.sgrh_documentos (doc_empresa_id);
