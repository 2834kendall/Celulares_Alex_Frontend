-- =====================================================================
-- Catálogo de bancos (entidades financieras de Costa Rica)
-- =====================================================================
-- ban_codigo es el código de entidad del BCCR: los tres dígitos que viajan
-- dentro del IBAN CR en las posiciones 6-8. La RPC de onboarding lo usa para
-- verificar que el IBAN que escribe el usuario realmente corresponde al banco
-- que seleccionó.
--
-- DO UPDATE sobre el código: si una entidad cambia de código, el seed
-- converge en vez de ignorarlo.
-- =====================================================================

INSERT INTO public.sgrh_cat_bancos (ban_nombre, ban_codigo) VALUES
  ('Banco Nacional',      '151'),
  ('Banco de Costa Rica', '152'),
  ('BAC Credomatic',      '102'),
  ('Banco Popular',       '161'),
  ('Scotiabank',          '123'),
  ('Davivienda',          '115'),
  ('Banco Promerica',     '114'),
  ('Banco Lafise',        '121'),
  ('Banco Cathay',        '118'),
  ('Banco BCT',           '107'),
  ('Banco Improsa',       '108')
ON CONFLICT (ban_nombre) DO UPDATE SET ban_codigo = EXCLUDED.ban_codigo;
