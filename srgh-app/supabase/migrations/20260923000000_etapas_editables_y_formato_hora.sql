-- =====================================================================
-- SGRH-61 — Etapas de selección editables + formato de hora por empresa
-- =====================================================================
-- Dos cambios que viajan juntos para no sumar otra migración (la sección
-- B se agregó cuando esta todavía no estaba aplicada en ningún entorno).
--
-- ─── A. Las etapas de selección las define la empresa, no el seed ─────
--
-- Las 20 etapas de sgrh_cat_etapas_seleccion venían del seed
-- 02_catalogos/06_reclutamiento.sql: un embudo genérico de RRHH
-- ("Assessment Center", "Prueba Psicométrica", "Verificación de
-- Referencias"…) que NADIE validó contra el proceso real de la empresa.
--
-- Ofrecerlas en el formulario de avance tiene un costo concreto: quien
-- carga la postulación elige lo primero que le suena de una lista ajena, y
-- el historial termina lleno de etapas que en la práctica nunca ocurrieron.
-- Es peor que no tener historial, porque parece dato bueno.
--
-- Desde acá el catálogo se administra desde Configuración, igual que los
-- criterios de puntaje: la empresa crea SUS etapas cuando las tenga claras.
--
--   1. eta_color: mismo patrón que are_color / hor_color. Sirve para
--      reconocer la etapa en la tarjeta del tablero.
--   2. Se desactivan las 20 sembradas. NO se borran: puede haber filas
--      históricas en sgrh_postulacion_etapas que las referencian, y el
--      historial tiene que seguir mostrando el nombre de lo que pasó.
--      Desactivarlas solo las saca del selector de "avanzar etapa".
--
-- Ojo: hasta que alguien cree la primera etapa, el formulario de avance
-- queda vacío a propósito y la UI manda a Configuración.
--
-- ─── B. Formato de hora (12h / 24h) por empresa ───────────────────────
--
-- Preferencia de PRESENTACIÓN. No cambia ni un dato: las columnas time /
-- timestamp siguen siendo lo que son, y la lógica (tardías, ventanas del
-- kiosco, planilla) sigue trabajando en 24h. Solo decide cómo se PINTA
-- una hora en pantalla. Default '24h' = nada cambia de aspecto hasta que
-- alguien lo toque desde Configuración.
--
-- Por empresa y no por usuario ni sucursal: es una convención de toda la
-- organización (una sucursal en 12h y otra en 24h no tendría sentido), y
-- la escribe quien administra la empresa. La RLS "empresas_update" ya
-- exige EMPRESAS_WRITE sobre la propia empresa: no hace falta policy nueva.
--
-- Archivo idempotente: se puede re-ejecutar sin efectos.
-- =====================================================================

ALTER TABLE public.sgrh_cat_etapas_seleccion
  ADD COLUMN IF NOT EXISTS eta_color text;

ALTER TABLE public.sgrh_cat_etapas_seleccion
  DROP CONSTRAINT IF EXISTS sgrh_cat_etapas_seleccion_color_hex;
ALTER TABLE public.sgrh_cat_etapas_seleccion
  ADD CONSTRAINT sgrh_cat_etapas_seleccion_color_hex
  CHECK (eta_color IS NULL OR eta_color ~ '^#[0-9a-fA-F]{6}$');

-- Por nombre y no por eta_id: mismo motivo que en 20260921000000 (los ids
-- de un catálogo sembrado con ON CONFLICT DO NOTHING pueden desfasarse
-- entre entornos). Solo toca las que sembró el proyecto; si alguien ya
-- creó etapas propias con otro nombre, quedan intactas.
UPDATE public.sgrh_cat_etapas_seleccion
SET eta_activo = false
WHERE eta_nombre IN (
  'Recepción de CV', 'Filtro Curricular', 'Entrevista Telefónica',
  'Prueba Técnica', 'Prueba Psicométrica', 'Entrevista con RRHH',
  'Entrevista con Jefatura', 'Verificación de Referencias',
  'Estudio de Antecedentes', 'Examen Médico Pre-empleo', 'Oferta Laboral',
  'Negociación de Condiciones', 'Firma de Contrato', 'Inducción General',
  'Inducción al Puesto', 'Período de Prueba',
  'Evaluación de Período de Prueba', 'Contratación Definitiva',
  'Segunda Entrevista Técnica', 'Assessment Center'
);

COMMENT ON COLUMN public.sgrh_cat_etapas_seleccion.eta_color IS
  'Color hex de la etapa en el tablero. NULL = sin color propio. Solo presentación.';
COMMENT ON COLUMN public.sgrh_cat_etapas_seleccion.eta_fase IS
  'Columna del tablero de selección: 1 postulados, 2 en evaluación, 3 decisión. La define quien crea la etapa desde Configuración.';

-- ─── B. Formato de hora por empresa ───────────────────────────────────

ALTER TABLE public.sgrh_empresas
  ADD COLUMN IF NOT EXISTS org_formato_hora varchar(3) NOT NULL DEFAULT '24h';

ALTER TABLE public.sgrh_empresas
  DROP CONSTRAINT IF EXISTS sgrh_empresas_formato_hora_check;
ALTER TABLE public.sgrh_empresas
  ADD CONSTRAINT sgrh_empresas_formato_hora_check
  CHECK (org_formato_hora IN ('12h', '24h'));

COMMENT ON COLUMN public.sgrh_empresas.org_formato_hora IS
  'Cómo se PINTAN las horas en pantalla: 12h (8:35 a. m.) o 24h (08:35). Solo presentación: los datos y la lógica de tardías/kiosco trabajan siempre en 24h.';
