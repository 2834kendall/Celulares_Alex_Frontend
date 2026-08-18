-- =====================================================================
-- Catálogo de conceptos de nómina
-- =====================================================================
-- Dos generaciones de conceptos convivían en el proyecto original: la serie
-- de diseño (ING/DED/PAT) y la del machote de planilla del cliente (BASE,
-- FERIADO, COMISION, AJUSTE, CCSS_OBRERA, HORAS_EXTRA). Cinco de la serie
-- vieja eran duplicados exactos y NO se siembran:
--
--   ING001 Salario Base            → duplicaba BASE
--   ING002 Horas Extra 50%         → duplicaba HORAS_EXTRA
--   ING003 Horas Extra 75%         → duplicaba HORAS_EXTRA
--   ING004 Comisiones por Ventas   → duplicaba COMISION
--   DED001 CCSS Obrero (SEM+IVM)   → duplicaba CCSS_OBRERA
--
-- El resto de la serie ING/DED/PAT SÍ se conserva: aguinaldo, renta, embargo,
-- préstamo, viáticos y las cargas patronales no tienen equivalente en el
-- machote y el módulo de nómina los va a necesitar.
--
-- HORAS_EXTRA nace INACTIVO a propósito: desde que existe el banco de horas
-- ya no se paga solo. Pero la fila tiene que existir igual — pagarBancoHoras
-- lo busca por código para armar el ingreso al liquidar horas pendientes.
-- =====================================================================

INSERT INTO public.sgrh_cat_conceptos_nomina (
  con_id, con_codigo, con_nombre, con_tipo,
  con_afecta_salario_bruto, con_afecta_base_ccss,
  con_formula_base, con_activo, con_tipo_calculo, con_porcentaje
)
OVERRIDING SYSTEM VALUE
VALUES
  -- ── Conceptos del machote de planilla (los que usa el código hoy) ────────
  (21, 'BASE',        'Salario base',                'ingreso',   true,  true,  NULL, true,  'monto_manual_ingreso',       NULL),
  (22, 'FERIADO',     'Feriado',                     'ingreso',   true,  true,  NULL, true,  'monto_manual_ingreso',       NULL),
  (23, 'COMISION',    'Comisión por ventas',         'ingreso',   true,  true,  NULL, true,  'monto_manual_ingreso',       NULL),
  (24, 'HORAS_EXTRA', 'Horas extra',                 'ingreso',   true,  true,  NULL, false, 'horas_extra_automatico',     150.000),
  (25, 'AJUSTE',      'Ajuste (mínimo garantizado)', 'ingreso',   true,  true,  NULL, true,  'monto_manual_ingreso',       NULL),
  (26, 'CCSS_OBRERA', 'Rebajo CCSS obrero (10,83%)', 'deduccion', false, true,  NULL, true,  'porcentaje_deduccion_bruto', 10.830),

  -- ── Ingresos adicionales ────────────────────────────────────────────────
  (5,  'ING005', 'Aguinaldo',                          'ingreso', false, false, 'aguinaldo',       true, 'monto_manual_ingreso', NULL),
  (6,  'ING006', 'Bono de Antigüedad',                 'ingreso', true,  true,  'antiguedad',      true, 'monto_manual_ingreso', NULL),
  (7,  'ING007', 'Recargo Nocturno',                   'ingreso', true,  true,  'recargo_nocturno', true, 'monto_manual_ingreso', NULL),
  (8,  'ING008', 'Vacaciones Pagadas',                 'ingreso', true,  true,  'vacaciones',      true, 'monto_manual_ingreso', NULL),
  (9,  'ING009', 'Incentivo por Cumplimiento de Metas','ingreso', true,  true,  'meta_cumplida',   true, 'monto_manual_ingreso', NULL),
  (10, 'ING010', 'Viáticos',                           'ingreso', false, false, 'viaticos',        true, 'monto_manual_ingreso', NULL),

  -- ── Deducciones ─────────────────────────────────────────────────────────
  (12, 'DED002', 'Impuesto sobre la Renta',            'deduccion', false, false, 'renta',             true, 'monto_manual_deduccion', NULL),
  (13, 'DED003', 'Embargo Judicial',                   'deduccion', false, false, 'embargo',           true, 'monto_manual_deduccion', NULL),
  (14, 'DED004', 'Préstamo Personal',                  'deduccion', false, false, 'prestamo',          true, 'monto_manual_deduccion', NULL),
  (15, 'DED005', 'Cuota Asociación Solidarista',       'deduccion', false, false, 'asociacion',        true, 'monto_manual_deduccion', NULL),
  (16, 'DED006', 'Ausencia sin Goce de Salario',       'deduccion', false, false, 'ausencia_sin_goce', true, 'monto_manual_deduccion', NULL),

  -- ── Cargas patronales ───────────────────────────────────────────────────
  -- Todavía no hay motor de cálculo: el código las excluye de la edición
  -- manual por con_tipo, no por con_tipo_calculo.
  (17, 'PAT001', 'CCSS Patronal (SEM+IVM)',   'patronal', false, false, 'ccss_patronal',       true,  'monto_manual_ingreso', NULL),
  (18, 'PAT002', 'INS Riesgos del Trabajo',   'patronal', false, false, 'ins_rt',              false, 'monto_manual_ingreso', NULL),
  (19, 'PAT003', 'Banco Popular Patronal',    'patronal', false, false, 'bp_patronal',         true,  'monto_manual_ingreso', NULL),
  (20, 'PAT004', 'FODESAF / IMAS / INA',      'patronal', false, false, 'cargas_sociales_ley', true,  'monto_manual_ingreso', NULL)
ON CONFLICT DO NOTHING;

SELECT setval(pg_get_serial_sequence('public.sgrh_cat_conceptos_nomina', 'con_id'),
              COALESCE((SELECT MAX(con_id) FROM public.sgrh_cat_conceptos_nomina), 1), true);
