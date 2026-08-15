-- =====================================================================
-- SGRH — Baseline: catálogos globales
-- =====================================================================
-- Catálogos sin dueño: compartidos por todas las empresas. Los catálogos
-- POR EMPRESA (puestos, horarios, feriados, niveles de comisión) viven en
-- 20260101000200 porque referencian sgrh_empresas.
--
-- El orden interno importa: provincias → cantones → distritos y
-- áreas → criterios son cadenas de FK.
-- =====================================================================

-- ─── 1. Seguridad: roles y permisos ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sgrh_cat_roles (
  rol_id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rol_codigo      character varying NOT NULL UNIQUE,
  rol_nombre      character varying NOT NULL,
  rol_descripcion character varying,
  rol_activo      boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.sgrh_cat_permisos (
  per_id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  per_codigo      character varying NOT NULL UNIQUE,
  per_modulo      character varying NOT NULL,
  per_nombre      character varying NOT NULL,
  per_descripcion character varying
);

-- La matriz rol→permiso. Es lo que lee custom_access_token_hook para armar
-- el claim `permisos` del JWT; sin filas aquí nadie puede hacer nada.
CREATE TABLE IF NOT EXISTS public.sgrh_rol_permisos (
  rpe_id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rpe_rol_id     integer NOT NULL,
  rpe_permiso_id integer NOT NULL,
  CONSTRAINT sgrh_usr_rpe_rol_id_fkey     FOREIGN KEY (rpe_rol_id)     REFERENCES public.sgrh_cat_roles(rol_id),
  CONSTRAINT sgrh_usr_rpe_permiso_id_fkey FOREIGN KEY (rpe_permiso_id) REFERENCES public.sgrh_cat_permisos(per_id)
);

-- ─── 2. División territorial de Costa Rica (IGN) ────────────────────────────

CREATE TABLE IF NOT EXISTS public.sgrh_cat_provincias (
  prv_id     integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  prv_codigo character varying NOT NULL UNIQUE,
  prv_nombre character varying NOT NULL
);

CREATE TABLE IF NOT EXISTS public.sgrh_cat_cantones (
  can_id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  can_provincia_id integer NOT NULL,
  can_codigo       character varying NOT NULL UNIQUE,
  can_nombre       character varying NOT NULL,
  CONSTRAINT sgrh_cat_can_provincia_id_fkey FOREIGN KEY (can_provincia_id) REFERENCES public.sgrh_cat_provincias(prv_id)
);

CREATE TABLE IF NOT EXISTS public.sgrh_cat_distritos (
  dis_id        integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dis_canton_id integer NOT NULL,
  dis_codigo    character varying NOT NULL UNIQUE,
  dis_nombre    character varying NOT NULL,
  CONSTRAINT sgrh_cat_dis_canton_id_fkey FOREIGN KEY (dis_canton_id) REFERENCES public.sgrh_cat_cantones(can_id)
);

-- ─── 3. Catálogos laborales ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sgrh_cat_tipos_identificacion (
  tid_id     integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tid_codigo character varying NOT NULL UNIQUE,
  tid_nombre character varying NOT NULL,
  tid_activo boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.sgrh_cat_tipos_jornada (
  tjo_id                  integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tjo_codigo              character varying NOT NULL UNIQUE,
  tjo_nombre              character varying NOT NULL,
  tjo_horas_max_diarias   numeric,
  tjo_horas_max_semanales numeric,
  tjo_recargo_porcentaje  numeric NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.sgrh_cat_tipos_contrato (
  tco_id               integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tco_codigo           character varying NOT NULL UNIQUE,
  tco_nombre           character varying NOT NULL,
  tco_permite_preaviso boolean NOT NULL DEFAULT true,
  tco_permite_cesantia boolean NOT NULL DEFAULT true,
  tco_nota_legal       text
);

CREATE TABLE IF NOT EXISTS public.sgrh_cat_motivos_salida (
  mot_id              integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mot_codigo          character varying NOT NULL UNIQUE,
  mot_nombre          character varying NOT NULL,
  mot_genera_preaviso boolean NOT NULL DEFAULT false,
  mot_genera_cesantia boolean NOT NULL DEFAULT false,
  mot_nota_legal      text
);

CREATE TABLE IF NOT EXISTS public.sgrh_cat_tipos_ausencia (
  tau_id                        integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tau_codigo                    character varying NOT NULL UNIQUE,
  tau_nombre                    character varying NOT NULL,
  tau_requiere_documento_ccss   boolean NOT NULL DEFAULT false,
  tau_paga_empleador_dias       integer NOT NULL DEFAULT 0,
  tau_porcentaje_pago_empleador numeric NOT NULL DEFAULT 0,
  tau_paga_ccss_desde_dia       integer,
  tau_porcentaje_subsidio_ccss  numeric,
  tau_descuenta_vacaciones      boolean NOT NULL DEFAULT false,
  tau_es_protegida              boolean NOT NULL DEFAULT false,
  tau_referencia_legal          character varying,
  tau_es_intradia               boolean NOT NULL DEFAULT false
);

COMMENT ON COLUMN public.sgrh_cat_tipos_ausencia.tau_es_intradia IS
  'true = la ausencia se mide en horas dentro de un mismo día (p. ej. lactancia), no en días completos.';

-- ─── 4. Bancos (IBAN) ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sgrh_cat_bancos (
  ban_id     serial PRIMARY KEY,
  ban_nombre varchar(80) NOT NULL UNIQUE,
  -- Código de entidad financiera del BCCR (el que viaja dentro del IBAN CR).
  -- NULL para entidades capturadas como texto libre cuyo código se desconoce.
  ban_codigo varchar(3) UNIQUE,
  ban_activo boolean NOT NULL DEFAULT true
);

-- ─── 5. Conceptos de nómina ─────────────────────────────────────────────────
-- con_tipo_calculo describe CÓMO se calcula el concepto, para que el código no
-- tenga que adivinarlo a partir del código del concepto:
--   monto_manual_ingreso       el usuario escribe el monto; suma al bruto
--   monto_manual_deduccion     el usuario escribe el monto; resta del neto
--   porcentaje_deduccion_bruto con_porcentaje % del bruto; se resta (CCSS obrera)
--   horas_extra_automatico     (horas − tope) × salario/hora × con_porcentaje

CREATE TABLE IF NOT EXISTS public.sgrh_cat_conceptos_nomina (
  con_id                   integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  con_codigo               character varying NOT NULL UNIQUE,
  con_nombre               character varying NOT NULL,
  con_tipo                 character varying NOT NULL,
  con_afecta_salario_bruto boolean NOT NULL DEFAULT false,
  con_afecta_base_ccss     boolean NOT NULL DEFAULT true,
  con_formula_base         character varying,
  con_activo               boolean NOT NULL DEFAULT true,
  con_tipo_calculo         text NOT NULL DEFAULT 'monto_manual_ingreso',
  con_porcentaje           numeric(6, 3),
  CONSTRAINT sgrh_cat_conceptos_nomina_con_tipo_calculo_check CHECK (
    con_tipo_calculo IN (
      'monto_manual_ingreso',
      'monto_manual_deduccion',
      'porcentaje_deduccion_bruto',
      'horas_extra_automatico'
    )
  ),
  -- con_porcentaje solo tiene sentido (y es obligatorio) para los dos tipos
  -- que lo usan; para los montos manuales debe quedar en NULL.
  CONSTRAINT sgrh_cat_conceptos_nomina_con_porcentaje_check CHECK (
    (
      con_tipo_calculo IN ('porcentaje_deduccion_bruto', 'horas_extra_automatico')
      AND con_porcentaje IS NOT NULL
      AND con_porcentaje > 0
    )
    OR (
      con_tipo_calculo IN ('monto_manual_ingreso', 'monto_manual_deduccion')
      AND con_porcentaje IS NULL
    )
  )
);

-- ─── 6. Evaluación de desempeño ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sgrh_cat_areas_evaluacion (
  are_id              integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  are_nombre          character varying NOT NULL UNIQUE,
  are_tipo_aplicacion character varying NOT NULL DEFAULT 'ambos'::character varying,
  are_activo          boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.sgrh_cat_criterios_evaluacion (
  cri_id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cri_area_id     integer NOT NULL,
  cri_descripcion character varying NOT NULL,
  cri_activo      boolean NOT NULL DEFAULT true,
  CONSTRAINT sgrh_cat_cri_area_id_fkey FOREIGN KEY (cri_area_id) REFERENCES public.sgrh_cat_areas_evaluacion(are_id)
);

-- ─── 7. Reclutamiento ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sgrh_cat_etapas_seleccion (
  eta_id     integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  eta_nombre character varying NOT NULL UNIQUE,
  eta_orden  smallint NOT NULL,
  eta_activo boolean NOT NULL DEFAULT true
);

-- ─── 8. Documentos del expediente ───────────────────────────────────────────
-- Catálogo GLOBAL (como bancos): compartido entre empresas, sembrado con un
-- set fijo, escritura vía CATALOGOS_WRITE. Sin UI de administración por ahora.

CREATE TABLE IF NOT EXISTS public.sgrh_cat_tipos_documento (
  tdo_id     serial PRIMARY KEY,
  tdo_codigo varchar(30) NOT NULL UNIQUE,
  tdo_nombre varchar(80) NOT NULL,
  tdo_activo boolean NOT NULL DEFAULT true
);
