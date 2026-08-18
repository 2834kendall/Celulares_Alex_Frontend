-- =====================================================================
-- Seed de DEMO — empresa y sucursales
-- =====================================================================
-- ⚠️  Este archivo NO está en sql_paths de config.toml a propósito: un
-- `db push --include-seed` contra producción NO debe crear esta empresa.
-- Se aplica explícitamente con `pnpm supabase:seed:demo`.
--
-- Son los datos reales de Celulares Alex / Infinity, para tener un entorno
-- de desarrollo que se parezca al de producción (probar nómina y asistencia
-- con geocercas y horarios creíbles).
--
-- Los catálogos POR EMPRESA (puestos, horarios, feriados, niveles de
-- comisión) todavía no están acá: se cargan desde la UI. Cuando existan,
-- este es el archivo donde van.
--
-- Convergente: se puede correr N veces. Ninguna de las tres tablas tiene un
-- índice único que sirva de ancla natural salvo org_cedula_juridica, así que
-- el resto usa anti-joins explícitos.
-- =====================================================================

-- ─── 1. Direcciones ─────────────────────────────────────────────────────────
-- Distrito 11903 = Daniel Flores, cantón Pérez Zeledón, provincia San José.
-- dir_codigo_postal lo calcula el trigger desde el distrito; no se pasa.

INSERT INTO public.sgrh_direcciones (dir_distrito_id, dir_senas_exactas)
SELECT d.dis_id, v.senas
FROM public.sgrh_cat_distritos d
CROSS JOIN (VALUES
  ('Centro Comercial Monte General'),
  ('Centro Comercial Monte General, frente a Multicinemas'),
  ('Centro Comercial Monte General, frente a la CAVA')
) AS v(senas)
WHERE d.dis_codigo = '11903'
  AND NOT EXISTS (
    SELECT 1 FROM public.sgrh_direcciones x
    WHERE x.dir_distrito_id = d.dis_id
      AND x.dir_senas_exactas = v.senas
  );

-- ─── 2. Empresa ─────────────────────────────────────────────────────────────

INSERT INTO public.sgrh_empresas (
  org_cedula_juridica, org_nombre_social, org_nombre_fantasia,
  org_actividad_economica_ciiu, org_representante_legal,
  org_telefono, org_email_corporativo,
  org_periodicidad_pago, org_dia_pago_1, org_dia_pago_2,
  org_activa, org_direccion_id
)
SELECT
  '3-102-866597',
  'Inversiones Scorlion SRL',
  'Infinity & Celulares Alex',
  'Venta de bazar y tecnologia',
  'Jose Edwin Rivera Arenas',
  '8895-9999',
  'scorlionsrl@gmail.com',
  'Quincenal',
  15,
  30,
  true,
  (SELECT dir_id FROM public.sgrh_direcciones
   WHERE dir_senas_exactas = 'Centro Comercial Monte General' LIMIT 1)
ON CONFLICT (org_cedula_juridica) DO NOTHING;

-- ─── 3. Sucursales ──────────────────────────────────────────────────────────
-- Las coordenadas son reales: la geocerca de 20 m se usa para validar que la
-- marca de asistencia se hizo dentro del local.

INSERT INTO public.sgrh_sucursales (
  suc_empresa_id, suc_nombre, suc_telefono, suc_email_sucursal,
  suc_latitud, suc_longitud, suc_radio_geocerca_metros,
  suc_tolerancia_tardia_minutos, suc_activa, suc_direccion_id
)
SELECT
  e.org_id, v.nombre, v.telefono, v.email,
  v.latitud, v.longitud, 20, 5, true,
  (SELECT dir_id FROM public.sgrh_direcciones WHERE dir_senas_exactas = v.senas LIMIT 1)
FROM public.sgrh_empresas e
CROSS JOIN (VALUES
  ('Tienda Infinity', '8895-9999', 'scorlionsrl@gmail.com', 9.341472::numeric, -83.673583::numeric,
   'Centro Comercial Monte General, frente a Multicinemas'),
  ('Celulares Alex',  '2772-6792', 'scorlionsrl@gmail.com', 9.341417::numeric, -83.673389::numeric,
   'Centro Comercial Monte General, frente a la CAVA')
) AS v(nombre, telefono, email, latitud, longitud, senas)
WHERE e.org_cedula_juridica = '3-102-866597'
  AND NOT EXISTS (
    SELECT 1 FROM public.sgrh_sucursales s
    WHERE s.suc_empresa_id = e.org_id AND s.suc_nombre = v.nombre
  );
