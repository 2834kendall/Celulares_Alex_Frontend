-- =====================================================================
-- SGRH — Baseline: entidades core y catálogos por empresa
-- =====================================================================
-- Orden dictado por las dependencias de FK:
--   direcciones → empresas → sucursales → catálogos por empresa →
--   empleados → usuarios → vínculos → historial laboral → datos de pago
--
-- Nota multi-tenant: sgrh_empleados NO tiene columna de empresa. La
-- pertenencia se resuelve SIEMPRE vía sgrh_historial_laboral.lab_empresa_id
-- (un empleado puede haber pasado por varias empresas del grupo). Las tablas
-- que denormalizan empresa_id lo hacen a propósito y está documentado en cada
-- caso.
-- =====================================================================

-- ─── 1. Direcciones ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sgrh_direcciones (
  dir_id            serial PRIMARY KEY,
  dir_distrito_id   int NOT NULL REFERENCES public.sgrh_cat_distritos(dis_id),
  -- Redundante con dis_codigo por diseño: se materializa para reportes y
  -- exports sin obligar al join de tres niveles. El DEFAULT existe solo para
  -- que quien inserta pueda omitir la columna; el trigger siempre la
  -- sobreescribe.
  dir_codigo_postal varchar(5) NOT NULL DEFAULT '',
  dir_senas_exactas varchar(300),
  dir_created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.sgrh_set_codigo_postal()
RETURNS trigger AS $$
BEGIN
  SELECT dis_codigo INTO NEW.dir_codigo_postal
  FROM public.sgrh_cat_distritos
  WHERE dis_id = NEW.dir_distrito_id;

  -- El FK también lo rechazaría, pero el trigger corre antes y sin esto el
  -- error sería un NOT NULL confuso en vez del 23503 que la UI ya interpreta.
  IF NEW.dir_codigo_postal IS NULL THEN
    RAISE EXCEPTION 'Distrito inexistente: %', NEW.dir_distrito_id
      USING ERRCODE = '23503'; -- foreign_key_violation
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_direcciones_codigo_postal ON public.sgrh_direcciones;
CREATE TRIGGER trg_direcciones_codigo_postal
  BEFORE INSERT OR UPDATE OF dir_distrito_id ON public.sgrh_direcciones
  FOR EACH ROW EXECUTE FUNCTION public.sgrh_set_codigo_postal();

-- Nadie debe poder invocarla como RPC: es una trigger function, no una API.
-- No es explotable (PostgREST no expone RETURNS trigger, y una llamada directa
-- muere con 'can only be called as a trigger' antes de ejecutar el cuerpo), pero
-- Postgres da EXECUTE a PUBLIC por defecto y el linter lo reporta como
-- "Public Can Execute SECURITY DEFINER Function". Revocarlo no cuesta nada: un
-- trigger NO chequea el EXECUTE del usuario al dispararse, solo al crearse.
REVOKE EXECUTE ON FUNCTION public.sgrh_set_codigo_postal ()
FROM PUBLIC, anon, authenticated;

-- ─── 2. Empresas y sucursales ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sgrh_empresas (
  org_id                       integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_cedula_juridica          character varying NOT NULL UNIQUE,
  org_nombre_social            character varying NOT NULL,
  org_nombre_fantasia          character varying,
  org_logo_url                 character varying,
  org_actividad_economica_ciiu character varying,
  org_representante_legal      character varying,
  org_telefono                 character varying,
  org_email_corporativo        character varying,
  org_periodicidad_pago        character varying NOT NULL,
  org_dia_pago_1               integer,
  org_dia_pago_2               integer,
  org_activa                   boolean NOT NULL DEFAULT true,
  org_created_at               timestamp without time zone NOT NULL DEFAULT now(),
  org_direccion_id             int REFERENCES public.sgrh_direcciones(dir_id)
);

CREATE TABLE IF NOT EXISTS public.sgrh_sucursales (
  suc_id                        integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  suc_empresa_id                integer NOT NULL,
  suc_nombre                    character varying NOT NULL,
  suc_codigo_interno            character varying,
  suc_telefono                  character varying,
  suc_email_sucursal            character varying,
  suc_latitud                   numeric,
  suc_longitud                  numeric,
  suc_radio_geocerca_metros     integer NOT NULL DEFAULT 50,
  suc_activa                    boolean NOT NULL DEFAULT true,
  suc_created_at                timestamp without time zone NOT NULL DEFAULT now(),
  suc_direccion_id              int REFERENCES public.sgrh_direcciones(dir_id),
  -- Minutos de gracia antes de contar una marca de entrada como tardía.
  suc_tolerancia_tardia_minutos integer NOT NULL DEFAULT 2,
  CONSTRAINT sgrh_org_suc_empresa_id_fkey FOREIGN KEY (suc_empresa_id) REFERENCES public.sgrh_empresas(org_id)
);

-- ─── 3. Catálogos por empresa ───────────────────────────────────────────────
-- A diferencia de los de 20260101000100, estos tienen dueño: cada empresa
-- define los suyos. Toda validación cruzada contra estos catálogos debe
-- comparar contra el empresa_id del JWT, nunca contra un id del cliente.

CREATE TABLE IF NOT EXISTS public.sgrh_cat_puestos (
  pue_id                        integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pue_empresa_id                integer NOT NULL,
  pue_nombre                    character varying NOT NULL,
  pue_descripcion               character varying,
  pue_salario_minimo_referencia numeric,
  pue_activo                    boolean NOT NULL DEFAULT true,
  CONSTRAINT sgrh_cat_pue_empresa_id_fkey FOREIGN KEY (pue_empresa_id) REFERENCES public.sgrh_empresas(org_id)
);

CREATE TABLE IF NOT EXISTS public.sgrh_cat_horarios (
  hor_id                    integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  hor_empresa_id            integer NOT NULL,
  hor_nombre                character varying NOT NULL,
  hor_tipo_jornada_id       integer NOT NULL,
  hor_hora_entrada          time without time zone NOT NULL,
  hor_hora_salida           time without time zone NOT NULL,
  hor_hora_inicio_almuerzo  time without time zone NOT NULL,
  hor_hora_fin_almuerzo     time without time zone NOT NULL,
  hor_duracion_almuerzo_min integer NOT NULL DEFAULT 60,
  hor_hora_inicio_break     time without time zone,
  hor_hora_fin_break        time without time zone,
  hor_duracion_break_min    integer NOT NULL DEFAULT 15,
  hor_activo                boolean NOT NULL DEFAULT true,
  CONSTRAINT sgrh_cat_hor_empresa_id_fkey      FOREIGN KEY (hor_empresa_id)      REFERENCES public.sgrh_empresas(org_id),
  CONSTRAINT sgrh_cat_hor_tipo_jornada_id_fkey FOREIGN KEY (hor_tipo_jornada_id) REFERENCES public.sgrh_cat_tipos_jornada(tjo_id)
);

CREATE TABLE IF NOT EXISTS public.sgrh_cat_niveles_comision (
  nvc_id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nvc_empresa_id   integer NOT NULL,
  nvc_nombre_nivel character varying NOT NULL,
  nvc_meta_minima  numeric NOT NULL,
  nvc_meta_maxima  numeric,
  nvc_porcentaje   numeric NOT NULL,
  nvc_activo       boolean NOT NULL DEFAULT true,
  CONSTRAINT sgrh_cat_nvc_empresa_id_fkey FOREIGN KEY (nvc_empresa_id) REFERENCES public.sgrh_empresas(org_id)
);

-- fer_empresa_id nullable: un feriado sin empresa es de alcance nacional.
CREATE TABLE IF NOT EXISTS public.sgrh_cat_feriados (
  fer_id                  integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fer_empresa_id          integer,
  fer_fecha               date NOT NULL,
  fer_nombre              character varying NOT NULL,
  fer_es_pago_obligatorio boolean NOT NULL DEFAULT true,
  fer_activo              boolean NOT NULL DEFAULT true,
  CONSTRAINT sgrh_cat_fer_empresa_id_fkey FOREIGN KEY (fer_empresa_id) REFERENCES public.sgrh_empresas(org_id)
);

-- ─── 4. Empleados ───────────────────────────────────────────────────────────
-- Los datos bancarios NO viven aquí: se movieron a sgrh_empleado_datos_pago
-- (relación 1:1) para poder validarlos contra el catálogo de bancos.

CREATE TABLE IF NOT EXISTS public.sgrh_empleados (
  emp_id                         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  emp_tipo_identificacion_id     integer NOT NULL,
  emp_numero_identificacion      character varying NOT NULL,
  emp_nombre                     character varying NOT NULL,
  emp_apellido_1                 character varying NOT NULL,
  emp_apellido_2                 character varying,
  emp_fecha_nacimiento           date,
  emp_genero                     character varying CHECK (emp_genero::text = ANY (ARRAY['M'::text, 'F'::text, 'O'::text])),
  emp_nacionalidad               character varying NOT NULL DEFAULT 'costarricense'::character varying,
  emp_email_personal             character varying UNIQUE,
  emp_telefono                   character varying,
  emp_telefono_emergencia        character varying,
  emp_nombre_contacto_emergencia character varying,
  emp_fecha_ingreso_original     date NOT NULL,
  emp_numero_asegurado_ccss      character varying,
  emp_rostro_hash                text,
  emp_created_at                 timestamp without time zone NOT NULL DEFAULT now(),
  emp_direccion_id               int NOT NULL REFERENCES public.sgrh_direcciones(dir_id),
  -- Ruta del objeto en el bucket fotos-empleados. NUNCA una URL firmada: las
  -- firmas expiran y se generan on-demand en el servidor.
  emp_foto_path                  text,
  CONSTRAINT sgrh_emp_tipo_identificacion_id_fkey       FOREIGN KEY (emp_tipo_identificacion_id) REFERENCES public.sgrh_cat_tipos_identificacion(tid_id),
  CONSTRAINT sgrh_empleados_emp_numero_identificacion_key UNIQUE (emp_numero_identificacion),
  CONSTRAINT sgrh_empleados_emp_numero_asegurado_ccss_key UNIQUE (emp_numero_asegurado_ccss)
);

-- La policy de SELECT de direcciones filtra por los empleados que las referencian.
CREATE INDEX IF NOT EXISTS sgrh_empleados_emp_direccion_id_idx
  ON public.sgrh_empleados (emp_direccion_id);

-- ─── 5. Usuarios y vínculos ─────────────────────────────────────────────────
-- usr_auth_id enlaza con auth.users. usr_password_hash es un remanente del
-- diseño previo a Supabase Auth: la contraseña real la administra Auth.

CREATE TABLE IF NOT EXISTS public.sgrh_usuarios (
  usr_id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usr_empleado_id   integer,
  usr_email         character varying NOT NULL UNIQUE,
  usr_password_hash character varying NOT NULL,
  usr_activo        boolean NOT NULL DEFAULT true,
  usr_ultimo_acceso timestamp without time zone,
  usr_created_at    timestamp without time zone NOT NULL DEFAULT now(),
  usr_auth_id       uuid UNIQUE,
  CONSTRAINT sgrh_usr_empleado_id_fkey      FOREIGN KEY (usr_empleado_id) REFERENCES public.sgrh_empleados(emp_id),
  CONSTRAINT sgrh_usuarios_usr_auth_id_fkey FOREIGN KEY (usr_auth_id)     REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS public.sgrh_usuarios_empresa_rol (
  uer_id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  uer_usuario_id integer NOT NULL,
  uer_empresa_id integer NOT NULL,
  uer_sucursal_id integer,
  uer_rol_id     integer NOT NULL,
  uer_activo     boolean NOT NULL DEFAULT true,
  uer_created_at timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT sgrh_usr_uer_usuario_id_fkey  FOREIGN KEY (uer_usuario_id)  REFERENCES public.sgrh_usuarios(usr_id),
  CONSTRAINT sgrh_usr_uer_empresa_id_fkey  FOREIGN KEY (uer_empresa_id)  REFERENCES public.sgrh_empresas(org_id),
  CONSTRAINT sgrh_usr_uer_sucursal_id_fkey FOREIGN KEY (uer_sucursal_id) REFERENCES public.sgrh_sucursales(suc_id),
  CONSTRAINT sgrh_usr_uer_rol_id_fkey      FOREIGN KEY (uer_rol_id)      REFERENCES public.sgrh_cat_roles(rol_id)
);

-- ─── 6. Historial laboral ───────────────────────────────────────────────────
-- La tabla pivote del sistema: es la que ata empleado ↔ empresa ↔ sucursal, y
-- por eso casi toda la RLS multi-tenant pasa por lab_empresa_id.

CREATE TABLE IF NOT EXISTS public.sgrh_historial_laboral (
  lab_id                    integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lab_empleado_id           integer NOT NULL,
  lab_empresa_id            integer NOT NULL,
  lab_sucursal_id           integer NOT NULL,
  lab_puesto_id             integer NOT NULL,
  lab_tipo_jornada_id       integer NOT NULL,
  lab_tipo_contrato_id      integer NOT NULL,
  lab_salario_base          numeric NOT NULL,
  lab_salario_real          numeric NOT NULL,
  lab_fecha_inicio          date NOT NULL,
  lab_fecha_fin             date,
  lab_motivo_salida_id      integer,
  lab_observaciones_salida  character varying,
  lab_recontratable         boolean NOT NULL DEFAULT true,
  lab_created_at            timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT sgrh_his_lab_empleado_id_fkey      FOREIGN KEY (lab_empleado_id)      REFERENCES public.sgrh_empleados(emp_id),
  CONSTRAINT sgrh_his_lab_empresa_id_fkey       FOREIGN KEY (lab_empresa_id)       REFERENCES public.sgrh_empresas(org_id),
  CONSTRAINT sgrh_his_lab_sucursal_id_fkey      FOREIGN KEY (lab_sucursal_id)      REFERENCES public.sgrh_sucursales(suc_id),
  CONSTRAINT sgrh_his_lab_puesto_id_fkey        FOREIGN KEY (lab_puesto_id)        REFERENCES public.sgrh_cat_puestos(pue_id),
  CONSTRAINT sgrh_his_lab_tipo_jornada_id_fkey  FOREIGN KEY (lab_tipo_jornada_id)  REFERENCES public.sgrh_cat_tipos_jornada(tjo_id),
  CONSTRAINT sgrh_his_lab_tipo_contrato_id_fkey FOREIGN KEY (lab_tipo_contrato_id) REFERENCES public.sgrh_cat_tipos_contrato(tco_id),
  CONSTRAINT sgrh_his_lab_motivo_salida_id_fkey FOREIGN KEY (lab_motivo_salida_id) REFERENCES public.sgrh_cat_motivos_salida(mot_id)
);

-- ─── 7. Datos de pago del empleado (1:1) ────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sgrh_empleado_datos_pago (
  edp_id            serial PRIMARY KEY,
  edp_empleado_id   int NOT NULL UNIQUE REFERENCES public.sgrh_empleados(emp_id) ON DELETE CASCADE,
  edp_tipo_cuenta   varchar(10) CHECK (edp_tipo_cuenta IN ('CORRIENTE', 'AHORRO', 'SINPE')),
  -- IBAN (CR + 20 dígitos) o teléfono de 8 dígitos si el tipo es SINPE.
  -- Se normaliza a mayúsculas y sin espacios antes de guardar.
  edp_numero_cuenta varchar(30),
  edp_banco_id      int REFERENCES public.sgrh_cat_bancos(ban_id),
  edp_created_at    timestamptz NOT NULL DEFAULT now()
);
