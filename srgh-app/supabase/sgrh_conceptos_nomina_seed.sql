-- Seed del catálogo de conceptos de nómina (sgrh_cat_conceptos_nomina).
-- Basado en la plantilla de planilla del cliente (machote de salarios):
-- ingresos por quincena + rebajo obrero CCSS.
-- Idempotente: se puede correr varias veces sin duplicar.

INSERT INTO public.sgrh_cat_conceptos_nomina
  (con_codigo, con_nombre, con_tipo, con_afecta_salario_bruto, con_afecta_base_ccss)
VALUES
  ('BASE',        'Salario base',                 'ingreso',   true,  true),
  ('FERIADO',     'Feriado',                      'ingreso',   true,  true),
  ('COMISION',    'Comisión por ventas',          'ingreso',   true,  true),
  ('HORAS_EXTRA', 'Horas extra',                  'ingreso',   true,  true),
  ('AJUSTE',      'Ajuste (mínimo garantizado)',  'ingreso',   true,  true),
  ('CCSS_OBRERA', 'Rebajo CCSS obrero (10,83%)',  'deduccion', false, true)
ON CONFLICT (con_codigo) DO NOTHING;
