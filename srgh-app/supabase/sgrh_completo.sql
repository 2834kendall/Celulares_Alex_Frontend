-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.sgrh_cat_areas_evaluacion (
  are_id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  are_nombre character varying NOT NULL UNIQUE,
  are_tipo_aplicacion character varying NOT NULL DEFAULT 'ambos'::character varying,
  are_activo boolean NOT NULL DEFAULT true,
  CONSTRAINT sgrh_cat_areas_evaluacion_pkey PRIMARY KEY (are_id)
);
CREATE TABLE public.sgrh_cat_conceptos_nomina (
  con_id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  con_codigo character varying NOT NULL UNIQUE,
  con_nombre character varying NOT NULL,
  con_tipo character varying NOT NULL,
  con_afecta_salario_bruto boolean NOT NULL DEFAULT false,
  con_afecta_base_ccss boolean NOT NULL DEFAULT true,
  con_formula_base character varying,
  con_activo boolean NOT NULL DEFAULT true,
  CONSTRAINT sgrh_cat_conceptos_nomina_pkey PRIMARY KEY (con_id)
);
CREATE TABLE public.sgrh_cat_etapas_seleccion (
  eta_id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  eta_nombre character varying NOT NULL UNIQUE,
  eta_orden smallint NOT NULL,
  eta_activo boolean NOT NULL DEFAULT true,
  CONSTRAINT sgrh_cat_etapas_seleccion_pkey PRIMARY KEY (eta_id)
);
CREATE TABLE public.sgrh_cat_motivos_salida (
  mot_id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  mot_codigo character varying NOT NULL UNIQUE,
  mot_nombre character varying NOT NULL,
  mot_genera_preaviso boolean NOT NULL DEFAULT false,
  mot_genera_cesantia boolean NOT NULL DEFAULT false,
  mot_nota_legal text,
  CONSTRAINT sgrh_cat_motivos_salida_pkey PRIMARY KEY (mot_id)
);
CREATE TABLE public.sgrh_cat_permisos (
  per_id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  per_codigo character varying NOT NULL UNIQUE,
  per_modulo character varying NOT NULL,
  per_nombre character varying NOT NULL,
  per_descripcion character varying,
  CONSTRAINT sgrh_cat_permisos_pkey PRIMARY KEY (per_id)
);
CREATE TABLE public.sgrh_cat_provincias (
  prv_id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  prv_codigo character varying NOT NULL UNIQUE,
  prv_nombre character varying NOT NULL,
  CONSTRAINT sgrh_cat_provincias_pkey PRIMARY KEY (prv_id)
);
CREATE TABLE public.sgrh_cat_roles (
  rol_id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  rol_codigo character varying NOT NULL UNIQUE,
  rol_nombre character varying NOT NULL,
  rol_descripcion character varying,
  rol_activo boolean NOT NULL DEFAULT true,
  CONSTRAINT sgrh_cat_roles_pkey PRIMARY KEY (rol_id)
);
CREATE TABLE public.sgrh_cat_tipos_ausencia (
  tau_id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  tau_codigo character varying NOT NULL UNIQUE,
  tau_nombre character varying NOT NULL,
  tau_requiere_documento_ccss boolean NOT NULL DEFAULT false,
  tau_paga_empleador_dias integer NOT NULL DEFAULT 0,
  tau_porcentaje_pago_empleador numeric NOT NULL DEFAULT 0,
  tau_paga_ccss_desde_dia integer,
  tau_porcentaje_subsidio_ccss numeric,
  tau_descuenta_vacaciones boolean NOT NULL DEFAULT false,
  tau_es_protegida boolean NOT NULL DEFAULT false,
  tau_referencia_legal character varying,
  CONSTRAINT sgrh_cat_tipos_ausencia_pkey PRIMARY KEY (tau_id)
);
CREATE TABLE public.sgrh_cat_tipos_contrato (
  tco_id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  tco_codigo character varying NOT NULL UNIQUE,
  tco_nombre character varying NOT NULL,
  tco_permite_preaviso boolean NOT NULL DEFAULT true,
  tco_permite_cesantia boolean NOT NULL DEFAULT true,
  tco_nota_legal text,
  CONSTRAINT sgrh_cat_tipos_contrato_pkey PRIMARY KEY (tco_id)
);
CREATE TABLE public.sgrh_cat_tipos_identificacion (
  tid_id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  tid_codigo character varying NOT NULL UNIQUE,
  tid_nombre character varying NOT NULL,
  tid_activo boolean NOT NULL DEFAULT true,
  CONSTRAINT sgrh_cat_tipos_identificacion_pkey PRIMARY KEY (tid_id)
);
CREATE TABLE public.sgrh_cat_tipos_jornada (
  tjo_id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  tjo_codigo character varying NOT NULL UNIQUE,
  tjo_nombre character varying NOT NULL,
  tjo_horas_max_diarias numeric,
  tjo_horas_max_semanales numeric,
  tjo_recargo_porcentaje numeric NOT NULL DEFAULT 0,
  CONSTRAINT sgrh_cat_tipos_jornada_pkey PRIMARY KEY (tjo_id)
);
CREATE TABLE public.sgrh_cat_cantones (
  can_id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  can_provincia_id integer NOT NULL,
  can_codigo character varying NOT NULL UNIQUE,
  can_nombre character varying NOT NULL,
  CONSTRAINT sgrh_cat_cantones_pkey PRIMARY KEY (can_id),
  CONSTRAINT sgrh_cat_can_provincia_id_fkey FOREIGN KEY (can_provincia_id) REFERENCES public.sgrh_cat_provincias(prv_id)
);
CREATE TABLE public.sgrh_cat_distritos (
  dis_id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  dis_canton_id integer NOT NULL,
  dis_codigo character varying NOT NULL UNIQUE,
  dis_nombre character varying NOT NULL,
  CONSTRAINT sgrh_cat_distritos_pkey PRIMARY KEY (dis_id),
  CONSTRAINT sgrh_cat_dis_canton_id_fkey FOREIGN KEY (dis_canton_id) REFERENCES public.sgrh_cat_cantones(can_id)
);
CREATE TABLE public.sgrh_cat_criterios_evaluacion (
  cri_id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  cri_area_id integer NOT NULL,
  cri_descripcion character varying NOT NULL,
  cri_activo boolean NOT NULL DEFAULT true,
  CONSTRAINT sgrh_cat_criterios_evaluacion_pkey PRIMARY KEY (cri_id),
  CONSTRAINT sgrh_cat_cri_area_id_fkey FOREIGN KEY (cri_area_id) REFERENCES public.sgrh_cat_areas_evaluacion(are_id)
);
CREATE TABLE public.sgrh_empleados (
  emp_id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  emp_tipo_identificacion_id integer NOT NULL,
  emp_numero_identificacion character varying NOT NULL,
  emp_nombre character varying NOT NULL,
  emp_apellido_1 character varying NOT NULL,
  emp_apellido_2 character varying,
  emp_fecha_nacimiento date,
  emp_genero character varying CHECK (emp_genero::text = ANY (ARRAY['M'::text, 'F'::text, 'O'::text])),
  emp_nacionalidad character varying NOT NULL DEFAULT 'costarricense'::character varying,
  emp_email_personal character varying UNIQUE,
  emp_telefono character varying,
  emp_telefono_emergencia character varying,
  emp_nombre_contacto_emergencia character varying,
  emp_fecha_ingreso_original date NOT NULL,
  emp_numero_asegurado_ccss character varying,
  emp_banco character varying,
  emp_tipo_cuenta character varying,
  emp_numero_cuenta character varying,
  emp_rostro_hash text,
  emp_created_at timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT sgrh_empleados_pkey PRIMARY KEY (emp_id),
  CONSTRAINT sgrh_emp_tipo_identificacion_id_fkey FOREIGN KEY (emp_tipo_identificacion_id) REFERENCES public.sgrh_cat_tipos_identificacion(tid_id)
);
CREATE TABLE public.sgrh_empresas (
  org_id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  org_cedula_juridica character varying NOT NULL UNIQUE,
  org_nombre_social character varying NOT NULL,
  org_nombre_fantasia character varying,
  org_logo_url character varying,
  org_actividad_economica_ciiu character varying,
  org_representante_legal character varying,
  org_distrito_id integer,
  org_direccion_exacta character varying,
  org_telefono character varying,
  org_email_corporativo character varying,
  org_periodicidad_pago character varying NOT NULL,
  org_dia_pago_1 integer,
  org_dia_pago_2 integer,
  org_activa boolean NOT NULL DEFAULT true,
  org_created_at timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT sgrh_empresas_pkey PRIMARY KEY (org_id),
  CONSTRAINT sgrh_org_distrito_id_fkey FOREIGN KEY (org_distrito_id) REFERENCES public.sgrh_cat_distritos(dis_id)
);
CREATE TABLE public.sgrh_sucursales (
  suc_id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  suc_empresa_id integer NOT NULL,
  suc_nombre character varying NOT NULL,
  suc_codigo_interno character varying,
  suc_distrito_id integer,
  suc_direccion_exacta character varying,
  suc_telefono character varying,
  suc_email_sucursal character varying,
  suc_latitud numeric,
  suc_longitud numeric,
  suc_radio_geocerca_metros integer NOT NULL DEFAULT 50,
  suc_activa boolean NOT NULL DEFAULT true,
  suc_created_at timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT sgrh_sucursales_pkey PRIMARY KEY (suc_id),
  CONSTRAINT sgrh_org_suc_distrito_id_fkey FOREIGN KEY (suc_distrito_id) REFERENCES public.sgrh_cat_distritos(dis_id),
  CONSTRAINT sgrh_org_suc_empresa_id_fkey FOREIGN KEY (suc_empresa_id) REFERENCES public.sgrh_empresas(org_id)
);
CREATE TABLE public.sgrh_usuarios (
  usr_id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  usr_empleado_id integer,
  usr_email character varying NOT NULL UNIQUE,
  usr_password_hash character varying NOT NULL,
  usr_activo boolean NOT NULL DEFAULT true,
  usr_ultimo_acceso timestamp without time zone,
  usr_created_at timestamp without time zone NOT NULL DEFAULT now(),
  usr_auth_id uuid UNIQUE,
  CONSTRAINT sgrh_usuarios_pkey PRIMARY KEY (usr_id),
  CONSTRAINT sgrh_usr_empleado_id_fkey FOREIGN KEY (usr_empleado_id) REFERENCES public.sgrh_empleados(emp_id),
  CONSTRAINT sgrh_usuarios_usr_auth_id_fkey FOREIGN KEY (usr_auth_id) REFERENCES auth.users(id)
);
CREATE TABLE public.sgrh_rol_permisos (
  rpe_id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  rpe_rol_id integer NOT NULL,
  rpe_permiso_id integer NOT NULL,
  CONSTRAINT sgrh_rol_permisos_pkey PRIMARY KEY (rpe_id),
  CONSTRAINT sgrh_usr_rpe_permiso_id_fkey FOREIGN KEY (rpe_permiso_id) REFERENCES public.sgrh_cat_permisos(per_id),
  CONSTRAINT sgrh_usr_rpe_rol_id_fkey FOREIGN KEY (rpe_rol_id) REFERENCES public.sgrh_cat_roles(rol_id)
);
CREATE TABLE public.sgrh_usuarios_empresa_rol (
  uer_id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  uer_usuario_id integer NOT NULL,
  uer_empresa_id integer NOT NULL,
  uer_sucursal_id integer,
  uer_rol_id integer NOT NULL,
  uer_activo boolean NOT NULL DEFAULT true,
  uer_created_at timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT sgrh_usuarios_empresa_rol_pkey PRIMARY KEY (uer_id),
  CONSTRAINT sgrh_usr_uer_empresa_id_fkey FOREIGN KEY (uer_empresa_id) REFERENCES public.sgrh_empresas(org_id),
  CONSTRAINT sgrh_usr_uer_rol_id_fkey FOREIGN KEY (uer_rol_id) REFERENCES public.sgrh_cat_roles(rol_id),
  CONSTRAINT sgrh_usr_uer_sucursal_id_fkey FOREIGN KEY (uer_sucursal_id) REFERENCES public.sgrh_sucursales(suc_id),
  CONSTRAINT sgrh_usr_uer_usuario_id_fkey FOREIGN KEY (uer_usuario_id) REFERENCES public.sgrh_usuarios(usr_id)
);
CREATE TABLE public.sgrh_cat_horarios (
  hor_id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  hor_empresa_id integer NOT NULL,
  hor_nombre character varying NOT NULL,
  hor_tipo_jornada_id integer NOT NULL,
  hor_hora_entrada time without time zone NOT NULL,
  hor_hora_salida time without time zone NOT NULL,
  hor_hora_inicio_almuerzo time without time zone NOT NULL,
  hor_hora_fin_almuerzo time without time zone NOT NULL,
  hor_duracion_almuerzo_min integer NOT NULL DEFAULT 60,
  hor_hora_inicio_break time without time zone,
  hor_hora_fin_break time without time zone,
  hor_duracion_break_min integer NOT NULL DEFAULT 15,
  hor_activo boolean NOT NULL DEFAULT true,
  CONSTRAINT sgrh_cat_horarios_pkey PRIMARY KEY (hor_id),
  CONSTRAINT sgrh_cat_hor_empresa_id_fkey FOREIGN KEY (hor_empresa_id) REFERENCES public.sgrh_empresas(org_id),
  CONSTRAINT sgrh_cat_hor_tipo_jornada_id_fkey FOREIGN KEY (hor_tipo_jornada_id) REFERENCES public.sgrh_cat_tipos_jornada(tjo_id)
);
CREATE TABLE public.sgrh_cat_niveles_comision (
  nvc_id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  nvc_empresa_id integer NOT NULL,
  nvc_nombre_nivel character varying NOT NULL,
  nvc_meta_minima numeric NOT NULL,
  nvc_meta_maxima numeric,
  nvc_porcentaje numeric NOT NULL,
  nvc_activo boolean NOT NULL DEFAULT true,
  CONSTRAINT sgrh_cat_niveles_comision_pkey PRIMARY KEY (nvc_id),
  CONSTRAINT sgrh_cat_nvc_empresa_id_fkey FOREIGN KEY (nvc_empresa_id) REFERENCES public.sgrh_empresas(org_id)
);
CREATE TABLE public.sgrh_cat_puestos (
  pue_id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  pue_empresa_id integer NOT NULL,
  pue_nombre character varying NOT NULL,
  pue_descripcion character varying,
  pue_salario_minimo_referencia numeric,
  pue_activo boolean NOT NULL DEFAULT true,
  CONSTRAINT sgrh_cat_puestos_pkey PRIMARY KEY (pue_id),
  CONSTRAINT sgrh_cat_pue_empresa_id_fkey FOREIGN KEY (pue_empresa_id) REFERENCES public.sgrh_empresas(org_id)
);
CREATE TABLE public.sgrh_cat_feriados (
  fer_id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  fer_empresa_id integer,
  fer_fecha date NOT NULL,
  fer_nombre character varying NOT NULL,
  fer_es_pago_obligatorio boolean NOT NULL DEFAULT true,
  fer_activo boolean NOT NULL DEFAULT true,
  CONSTRAINT sgrh_cat_feriados_pkey PRIMARY KEY (fer_id),
  CONSTRAINT sgrh_cat_fer_empresa_id_fkey FOREIGN KEY (fer_empresa_id) REFERENCES public.sgrh_empresas(org_id)
);
CREATE TABLE public.sgrh_historial_laboral (
  lab_id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  lab_empleado_id integer NOT NULL,
  lab_empresa_id integer NOT NULL,
  lab_sucursal_id integer NOT NULL,
  lab_puesto_id integer NOT NULL,
  lab_tipo_jornada_id integer NOT NULL,
  lab_tipo_contrato_id integer NOT NULL,
  lab_salario_base numeric NOT NULL,
  lab_salario_real numeric NOT NULL,
  lab_fecha_inicio date NOT NULL,
  lab_fecha_fin date,
  lab_motivo_salida_id integer,
  lab_observaciones_salida character varying,
  lab_recontratable boolean NOT NULL DEFAULT true,
  lab_created_at timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT sgrh_historial_laboral_pkey PRIMARY KEY (lab_id),
  CONSTRAINT sgrh_his_lab_empleado_id_fkey FOREIGN KEY (lab_empleado_id) REFERENCES public.sgrh_empleados(emp_id),
  CONSTRAINT sgrh_his_lab_empresa_id_fkey FOREIGN KEY (lab_empresa_id) REFERENCES public.sgrh_empresas(org_id),
  CONSTRAINT sgrh_his_lab_motivo_salida_id_fkey FOREIGN KEY (lab_motivo_salida_id) REFERENCES public.sgrh_cat_motivos_salida(mot_id),
  CONSTRAINT sgrh_his_lab_puesto_id_fkey FOREIGN KEY (lab_puesto_id) REFERENCES public.sgrh_cat_puestos(pue_id),
  CONSTRAINT sgrh_his_lab_sucursal_id_fkey FOREIGN KEY (lab_sucursal_id) REFERENCES public.sgrh_sucursales(suc_id),
  CONSTRAINT sgrh_his_lab_tipo_contrato_id_fkey FOREIGN KEY (lab_tipo_contrato_id) REFERENCES public.sgrh_cat_tipos_contrato(tco_id),
  CONSTRAINT sgrh_his_lab_tipo_jornada_id_fkey FOREIGN KEY (lab_tipo_jornada_id) REFERENCES public.sgrh_cat_tipos_jornada(tjo_id)
);
CREATE TABLE public.sgrh_beneficios_empleado (
  ben_id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  ben_historial_laboral_id integer NOT NULL,
  ben_descripcion character varying NOT NULL,
  ben_monto_total numeric NOT NULL,
  ben_monto_deducido numeric NOT NULL DEFAULT 0,
  ben_cuotas_pactadas integer,
  ben_cuota_mensual numeric,
  ben_fecha_inicio date NOT NULL,
  ben_fecha_fin_estimada date,
  ben_activo boolean NOT NULL DEFAULT true,
  ben_observaciones character varying,
  ben_created_at timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT sgrh_beneficios_empleado_pkey PRIMARY KEY (ben_id),
  CONSTRAINT sgrh_his_ben_historial_laboral_id_fkey FOREIGN KEY (ben_historial_laboral_id) REFERENCES public.sgrh_historial_laboral(lab_id)
);
CREATE TABLE public.sgrh_marcas_asistencia (
  mar_id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  mar_historial_laboral_id integer NOT NULL,
  mar_sucursal_id integer NOT NULL,
  mar_tipo character varying NOT NULL,
  mar_fecha_hora timestamp without time zone NOT NULL,
  mar_latitud_marcada numeric,
  mar_longitud_marcada numeric,
  mar_distancia_geocerca_metros numeric,
  mar_metodo_verificacion character varying NOT NULL CHECK (mar_metodo_verificacion::text = ANY (ARRAY['FACIAL'::text, 'MANUAL'::text])),
  mar_dispositivo_id character varying,
  mar_registrado_por_id integer,
  mar_observacion character varying,
  mar_created_at timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT sgrh_marcas_asistencia_pkey PRIMARY KEY (mar_id),
  CONSTRAINT sgrh_asi_mar_historial_laboral_id_fkey FOREIGN KEY (mar_historial_laboral_id) REFERENCES public.sgrh_historial_laboral(lab_id),
  CONSTRAINT sgrh_asi_mar_registrado_por_id_fkey FOREIGN KEY (mar_registrado_por_id) REFERENCES public.sgrh_usuarios(usr_id),
  CONSTRAINT sgrh_asi_mar_sucursal_id_fkey FOREIGN KEY (mar_sucursal_id) REFERENCES public.sgrh_sucursales(suc_id)
);
CREATE TABLE public.sgrh_ausencias (
  aus_id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  aus_historial_laboral_id integer NOT NULL,
  aus_tipo_ausencia_id integer NOT NULL,
  aus_fecha_inicio date NOT NULL,
  aus_fecha_fin date NOT NULL,
  aus_dias_habiles numeric,
  aus_dias_naturales numeric,
  aus_estado character varying NOT NULL DEFAULT 'pendiente'::character varying,
  aus_aprobado_por_id integer,
  aus_fecha_aprobacion timestamp without time zone,
  aus_motivo_rechazo character varying,
  aus_numero_boleta_ccss character varying,
  aus_documento_url character varying,
  aus_dias_paga_empleador numeric NOT NULL DEFAULT 0,
  aus_dias_paga_ccss numeric NOT NULL DEFAULT 0,
  aus_dias_sin_goce numeric NOT NULL DEFAULT 0,
  aus_observaciones character varying,
  aus_created_at timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT sgrh_ausencias_pkey PRIMARY KEY (aus_id),
  CONSTRAINT sgrh_asi_aus_aprobado_por_id_fkey FOREIGN KEY (aus_aprobado_por_id) REFERENCES public.sgrh_usuarios(usr_id),
  CONSTRAINT sgrh_asi_aus_historial_laboral_id_fkey FOREIGN KEY (aus_historial_laboral_id) REFERENCES public.sgrh_historial_laboral(lab_id),
  CONSTRAINT sgrh_asi_aus_tipo_ausencia_id_fkey FOREIGN KEY (aus_tipo_ausencia_id) REFERENCES public.sgrh_cat_tipos_ausencia(tau_id)
);
CREATE TABLE public.sgrh_programacion_semanal (
  prg_id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  prg_empleado_id integer NOT NULL,
  prg_sucursal_id integer NOT NULL,
  prg_historial_laboral_id integer NOT NULL,
  prg_horario_id integer,
  prg_fecha date NOT NULL,
  prg_es_dia_libre boolean NOT NULL DEFAULT false,
  prg_es_feriado boolean NOT NULL DEFAULT false,
  prg_es_apertura boolean NOT NULL DEFAULT false,
  prg_es_cierre boolean NOT NULL DEFAULT false,
  prg_creado_por_id integer,
  prg_observaciones character varying,
  CONSTRAINT sgrh_programacion_semanal_pkey PRIMARY KEY (prg_id),
  CONSTRAINT sgrh_asi_prg_creado_por_id_fkey FOREIGN KEY (prg_creado_por_id) REFERENCES public.sgrh_empleados(emp_id),
  CONSTRAINT sgrh_asi_prg_empleado_id_fkey FOREIGN KEY (prg_empleado_id) REFERENCES public.sgrh_empleados(emp_id),
  CONSTRAINT sgrh_asi_prg_historial_laboral_id_fkey FOREIGN KEY (prg_historial_laboral_id) REFERENCES public.sgrh_historial_laboral(lab_id),
  CONSTRAINT sgrh_asi_prg_horario_id_fkey FOREIGN KEY (prg_horario_id) REFERENCES public.sgrh_cat_horarios(hor_id),
  CONSTRAINT sgrh_asi_prg_sucursal_id_fkey FOREIGN KEY (prg_sucursal_id) REFERENCES public.sgrh_sucursales(suc_id)
);
CREATE TABLE public.sgrh_nomina_periodo (
  npe_id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  npe_empresa_id integer NOT NULL,
  npe_sucursal_id integer NOT NULL,
  npe_periodo_mes smallint NOT NULL,
  npe_periodo_anio integer NOT NULL,
  npe_quincena smallint NOT NULL DEFAULT 1,
  npe_fecha_inicio_periodo date,
  npe_fecha_fin_periodo date,
  npe_estado character varying NOT NULL DEFAULT 'borrador'::character varying,
  npe_aprobado_por_id integer,
  npe_fecha_aprobacion timestamp without time zone,
  npe_fecha_pago date,
  npe_observaciones character varying,
  npe_created_at timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT sgrh_nomina_periodo_pkey PRIMARY KEY (npe_id),
  CONSTRAINT sgrh_nom_per_empresa_id_fkey FOREIGN KEY (npe_empresa_id) REFERENCES public.sgrh_empresas(org_id),
  CONSTRAINT sgrh_nom_per_sucursal_id_fkey FOREIGN KEY (npe_sucursal_id) REFERENCES public.sgrh_sucursales(suc_id),
  CONSTRAINT sgrh_nom_per_aprobado_por_id_fkey FOREIGN KEY (npe_aprobado_por_id) REFERENCES public.sgrh_usuarios(usr_id)
);
CREATE TABLE public.sgrh_nomina_detalle (
  ndt_id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  ndt_nomina_periodo_id integer NOT NULL,
  ndt_historial_laboral_id integer NOT NULL,
  ndt_horas_ordinarias_diurnas numeric NOT NULL DEFAULT 0,
  ndt_horas_ordinarias_nocturnas numeric NOT NULL DEFAULT 0,
  ndt_horas_ordinarias_mixtas numeric NOT NULL DEFAULT 0,
  ndt_horas_extra_al_50 numeric NOT NULL DEFAULT 0,
  ndt_horas_extra_al_75 numeric NOT NULL DEFAULT 0,
  ndt_dias_ausencia_sin_goce numeric NOT NULL DEFAULT 0,
  ndt_dias_incapacidad_ccss numeric NOT NULL DEFAULT 0,
  ndt_dias_incapacidad_empleador numeric NOT NULL DEFAULT 0,
  ndt_salario_bruto numeric NOT NULL DEFAULT 0,
  ndt_total_deducciones_obreras numeric NOT NULL DEFAULT 0,
  ndt_total_cargas_patronales numeric NOT NULL DEFAULT 0,
  ndt_salario_neto numeric NOT NULL DEFAULT 0,
  ndt_pagado boolean NOT NULL DEFAULT false,
  ndt_fecha_pago date,
  ndt_fecha_registro date NOT NULL,
  ndt_created_at timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT sgrh_nomina_detalle_pkey PRIMARY KEY (ndt_id),
  CONSTRAINT sgrh_nom_det_nomina_periodo_id_fkey FOREIGN KEY (ndt_nomina_periodo_id) REFERENCES public.sgrh_nomina_periodo(npe_id),
  CONSTRAINT sgrh_nom_det_historial_laboral_id_fkey FOREIGN KEY (ndt_historial_laboral_id) REFERENCES public.sgrh_historial_laboral(lab_id)
);
CREATE TABLE public.sgrh_nomina_linea_ingreso (
  ing_id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  ing_nomina_detalle_id integer NOT NULL,
  ing_concepto_id integer NOT NULL,
  ing_cantidad numeric,
  ing_tarifa_unitaria numeric,
  ing_monto numeric NOT NULL,
  ing_observacion character varying,
  CONSTRAINT sgrh_nomina_linea_ingreso_pkey PRIMARY KEY (ing_id),
  CONSTRAINT sgrh_nom_lin_ing_concepto_id_fkey FOREIGN KEY (ing_concepto_id) REFERENCES public.sgrh_cat_conceptos_nomina(con_id),
  CONSTRAINT sgrh_nom_lin_ing_nomina_detalle_id_fkey FOREIGN KEY (ing_nomina_detalle_id) REFERENCES public.sgrh_nomina_detalle(ndt_id)
);
CREATE TABLE public.sgrh_nomina_linea_deduccion (
  ded_id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  ded_nomina_detalle_id integer NOT NULL,
  ded_concepto_id integer NOT NULL,
  ded_porcentaje_aplicado numeric,
  ded_base_calculo numeric,
  ded_monto numeric NOT NULL,
  ded_es_voluntaria boolean NOT NULL DEFAULT false,
  ded_beneficio_id integer,
  ded_observacion character varying,
  CONSTRAINT sgrh_nomina_linea_deduccion_pkey PRIMARY KEY (ded_id),
  CONSTRAINT sgrh_nom_lin_ded_concepto_id_fkey FOREIGN KEY (ded_concepto_id) REFERENCES public.sgrh_cat_conceptos_nomina(con_id),
  CONSTRAINT sgrh_nom_lin_ded_nomina_detalle_id_fkey FOREIGN KEY (ded_nomina_detalle_id) REFERENCES public.sgrh_nomina_detalle(ndt_id),
  CONSTRAINT sgrh_nom_lin_ded_beneficio_id_fkey FOREIGN KEY (ded_beneficio_id) REFERENCES public.sgrh_beneficios_empleado(ben_id)
);
CREATE TABLE public.sgrh_nomina_linea_patronal (
  pat_id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  pat_nomina_detalle_id integer NOT NULL,
  pat_concepto_id integer NOT NULL,
  pat_porcentaje_aplicado numeric,
  pat_base_calculo numeric,
  pat_monto numeric NOT NULL,
  CONSTRAINT sgrh_nomina_linea_patronal_pkey PRIMARY KEY (pat_id),
  CONSTRAINT sgrh_nom_lin_pat_concepto_id_fkey FOREIGN KEY (pat_concepto_id) REFERENCES public.sgrh_cat_conceptos_nomina(con_id),
  CONSTRAINT sgrh_nom_lin_pat_nomina_detalle_id_fkey FOREIGN KEY (pat_nomina_detalle_id) REFERENCES public.sgrh_nomina_detalle(ndt_id)
);
CREATE TABLE public.sgrh_comprobantes_pago (
  com_id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  com_nomina_detalle_id integer NOT NULL,
  com_codigo_verificacion character varying NOT NULL UNIQUE,
  com_fecha_emision timestamp without time zone NOT NULL DEFAULT now(),
  com_metodo_pago character varying,
  com_referencia_bancaria character varying,
  com_confirmado_por_empleado boolean NOT NULL DEFAULT false,
  com_fecha_confirmacion timestamp without time zone,
  CONSTRAINT sgrh_comprobantes_pago_pkey PRIMARY KEY (com_id),
  CONSTRAINT sgrh_nom_com_nomina_detalle_id_fkey FOREIGN KEY (com_nomina_detalle_id) REFERENCES public.sgrh_nomina_detalle(ndt_id)
);
CREATE TABLE public.sgrh_comisiones_calculadas (
  cal_id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  cal_historial_laboral_id integer NOT NULL,
  cal_periodo_mes smallint NOT NULL,
  cal_periodo_anio integer NOT NULL,
  cal_quincena smallint NOT NULL,
  cal_nivel_comision_id integer,
  cal_monto_comision numeric NOT NULL,
  cal_nomina_detalle_id integer,
  cal_observacion character varying,
  cal_registrado_por integer NOT NULL,
  cal_created_at timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT sgrh_comisiones_calculadas_pkey PRIMARY KEY (cal_id),
  CONSTRAINT sgrh_com_cal_historial_laboral_id_fkey FOREIGN KEY (cal_historial_laboral_id) REFERENCES public.sgrh_historial_laboral(lab_id),
  CONSTRAINT sgrh_com_cal_nivel_comision_id_fkey FOREIGN KEY (cal_nivel_comision_id) REFERENCES public.sgrh_cat_niveles_comision(nvc_id),
  CONSTRAINT sgrh_com_cal_nomina_detalle_id_fkey FOREIGN KEY (cal_nomina_detalle_id) REFERENCES public.sgrh_nomina_detalle(ndt_id),
  CONSTRAINT sgrh_com_cal_registrado_por_fkey FOREIGN KEY (cal_registrado_por) REFERENCES public.sgrh_usuarios(usr_id)
);
CREATE TABLE public.sgrh_provisiones_anuales (
  pra_id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  pra_historial_laboral_id integer NOT NULL,
  pra_anio integer NOT NULL,
  pra_monto_acumulado_aguinaldo numeric NOT NULL DEFAULT 0,
  pra_aguinaldo_pagado boolean NOT NULL DEFAULT false,
  pra_fecha_pago_aguinaldo date,
  pra_monto_acumulado_cesantia numeric NOT NULL DEFAULT 0,
  pra_anios_servicio_al_cierre numeric,
  pra_dias_vacaciones_ganados numeric NOT NULL DEFAULT 0,
  pra_dias_vacaciones_usados numeric NOT NULL DEFAULT 0,
  pra_dias_vacaciones_disponibles numeric DEFAULT (pra_dias_vacaciones_ganados - pra_dias_vacaciones_usados),
  pra_updated_at timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT sgrh_provisiones_anuales_pkey PRIMARY KEY (pra_id),
  CONSTRAINT sgrh_prv_anu_historial_laboral_id_fkey FOREIGN KEY (pra_historial_laboral_id) REFERENCES public.sgrh_historial_laboral(lab_id)
);
CREATE TABLE public.sgrh_candidatos (
  cdt_id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  cdt_tipo_identificacion_id integer,
  cdt_numero_identificacion character varying,
  cdt_nombre character varying NOT NULL,
  cdt_apellido_1 character varying NOT NULL,
  cdt_apellido_2 character varying,
  cdt_email character varying NOT NULL,
  cdt_telefono character varying,
  cdt_cv_url character varying,
  cdt_fuente_reclutamiento character varying,
  cdt_created_at timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT sgrh_candidatos_pkey PRIMARY KEY (cdt_id),
  CONSTRAINT sgrh_rec_cdt_tipo_identificacion_id_fkey FOREIGN KEY (cdt_tipo_identificacion_id) REFERENCES public.sgrh_cat_tipos_identificacion(tid_id)
);
CREATE TABLE public.sgrh_postulaciones (
  pos_id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  pos_candidato_id integer NOT NULL,
  pos_puesto_id integer NOT NULL,
  pos_empresa_id integer NOT NULL,
  pos_sucursal_id integer,
  pos_fecha_postula date NOT NULL DEFAULT now(),
  pos_estado_final character varying NOT NULL DEFAULT 'en_proceso'::character varying,
  pos_observaciones character varying,
  pos_created_at timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT sgrh_postulaciones_pkey PRIMARY KEY (pos_id),
  CONSTRAINT sgrh_rec_pos_candidato_id_fkey FOREIGN KEY (pos_candidato_id) REFERENCES public.sgrh_candidatos(cdt_id),
  CONSTRAINT sgrh_rec_pos_empresa_id_fkey FOREIGN KEY (pos_empresa_id) REFERENCES public.sgrh_empresas(org_id),
  CONSTRAINT sgrh_rec_pos_puesto_id_fkey FOREIGN KEY (pos_puesto_id) REFERENCES public.sgrh_cat_puestos(pue_id),
  CONSTRAINT sgrh_rec_pos_sucursal_id_fkey FOREIGN KEY (pos_sucursal_id) REFERENCES public.sgrh_sucursales(suc_id)
);
CREATE TABLE public.sgrh_postulacion_etapas (
  pet_id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  pet_postulacion_id integer NOT NULL,
  pet_etapa_id integer NOT NULL,
  pet_fecha date NOT NULL,
  pet_responsable_id integer,
  pet_resultado character varying,
  pet_notas character varying,
  pet_created_at timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT sgrh_postulacion_etapas_pkey PRIMARY KEY (pet_id),
  CONSTRAINT sgrh_rec_pet_etapa_id_fkey FOREIGN KEY (pet_etapa_id) REFERENCES public.sgrh_cat_etapas_seleccion(eta_id),
  CONSTRAINT sgrh_rec_pet_postulacion_id_fkey FOREIGN KEY (pet_postulacion_id) REFERENCES public.sgrh_postulaciones(pos_id),
  CONSTRAINT sgrh_rec_pet_responsable_id_fkey FOREIGN KEY (pet_responsable_id) REFERENCES public.sgrh_usuarios(usr_id)
);
CREATE TABLE public.sgrh_evaluaciones (
  eve_id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  eve_empresa_id integer NOT NULL,
  eve_tipo_evaluacion character varying NOT NULL,
  eve_historial_laboral_id integer,
  eve_sucursal_id integer,
  eve_evaluador_id integer NOT NULL,
  eve_fecha_evaluacion date NOT NULL,
  eve_tipo_periodo character varying NOT NULL,
  eve_estado character varying NOT NULL DEFAULT 'borrador'::character varying,
  eve_promedio_final numeric,
  eve_resultado_texto character varying,
  eve_observaciones character varying,
  eve_created_at timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT sgrh_evaluaciones_pkey PRIMARY KEY (eve_id),
  CONSTRAINT sgrh_eva_enc_empresa_id_fkey FOREIGN KEY (eve_empresa_id) REFERENCES public.sgrh_empresas(org_id),
  CONSTRAINT sgrh_eva_enc_evaluador_id_fkey FOREIGN KEY (eve_evaluador_id) REFERENCES public.sgrh_usuarios(usr_id),
  CONSTRAINT sgrh_eva_enc_historial_laboral_id_fkey FOREIGN KEY (eve_historial_laboral_id) REFERENCES public.sgrh_historial_laboral(lab_id),
  CONSTRAINT sgrh_eva_enc_sucursal_id_fkey FOREIGN KEY (eve_sucursal_id) REFERENCES public.sgrh_sucursales(suc_id)
);
CREATE TABLE public.sgrh_evaluacion_resultados (
  evr_id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  evr_evaluacion_id integer NOT NULL,
  evr_criterio_id integer NOT NULL,
  evr_puntaje numeric,
  evr_observacion character varying,
  evr_no_aplica boolean NOT NULL DEFAULT false,
  CONSTRAINT sgrh_evaluacion_resultados_pkey PRIMARY KEY (evr_id),
  CONSTRAINT sgrh_eva_res_criterio_id_fkey FOREIGN KEY (evr_criterio_id) REFERENCES public.sgrh_cat_criterios_evaluacion(cri_id),
  CONSTRAINT sgrh_eva_res_evaluacion_id_fkey FOREIGN KEY (evr_evaluacion_id) REFERENCES public.sgrh_evaluaciones(eve_id)
);
CREATE TABLE public.sgrh_notificaciones (
  ntf_id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  ntf_usuario_id integer,
  ntf_empleado_id integer,
  ntf_empresa_id integer,
  ntf_tipo_notificacion character varying NOT NULL CHECK (ntf_tipo_notificacion::text = ANY (ARRAY['cumpleanos'::text, 'vencimiento'::text, 'ausencia_aprobada'::text, 'ausencia_rechazada'::text, 'pago_nomina'::text, 'evaluacion'::text, 'advertencia'::text, 'informacion'::text, 'cambio_horario'::text])),
  ntf_canal character varying NOT NULL,
  ntf_titulo character varying NOT NULL,
  ntf_mensaje character varying NOT NULL,
  ntf_url_accion character varying,
  ntf_estado character varying NOT NULL DEFAULT 'pendiente'::character varying,
  ntf_leida boolean NOT NULL DEFAULT false,
  ntf_fecha_lectura timestamp without time zone,
  ntf_fecha_envio timestamp without time zone,
  ntf_intentos smallint NOT NULL DEFAULT 0,
  ntf_created_at timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT sgrh_notificaciones_pkey PRIMARY KEY (ntf_id),
  CONSTRAINT sgrh_not_ntf_empleado_id_fkey FOREIGN KEY (ntf_empleado_id) REFERENCES public.sgrh_empleados(emp_id),
  CONSTRAINT sgrh_not_ntf_empresa_id_fkey FOREIGN KEY (ntf_empresa_id) REFERENCES public.sgrh_empresas(org_id),
  CONSTRAINT sgrh_not_ntf_usuario_id_fkey FOREIGN KEY (ntf_usuario_id) REFERENCES public.sgrh_usuarios(usr_id)
);