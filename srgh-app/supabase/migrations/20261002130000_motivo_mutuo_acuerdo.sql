-- =====================================================================
-- Mutuo acuerdo: la cesantía la decide quien liquida
-- =====================================================================
-- El Art. 86 del Código de Trabajo pone el mutuo consentimiento entre las
-- causas que terminan el contrato sin responsabilidad para ninguna de las
-- partes: la ley no obliga a pagar preaviso ni cesantía, pero las partes
-- pueden pactarla. El catálogo decía mot_genera_cesantia = true para
-- MUT001 y la liquidación la pagaba siempre.
--
-- Desde ahora la liquidación no mira mot_genera_cesantia para este motivo:
-- pregunta si se pactó (procesarLiquidacion, MOTIVO_MUTUO_ACUERDO). Acá
-- solo se corrige la nota legal que ve quien liquida.
--
-- Idempotente.
-- =====================================================================

UPDATE public.sgrh_cat_motivos_salida
SET mot_nota_legal = 'Art. 86 Código de Trabajo: termina sin responsabilidad para las partes. No genera preaviso; la cesantía se paga solo si se pactó, y se indica al liquidar.'
WHERE mot_codigo = 'MUT001'
  AND mot_nota_legal = 'Se pacta condición de salida entre empleado y patrono.';
