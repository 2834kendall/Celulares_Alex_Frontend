-- =====================================================================
-- Código de verificación para los pagos de planilla que no tienen uno
-- =====================================================================
-- El buscador de comprobantes (Nómina → "Buscar comprobante por código")
-- solo encuentra pagos con fila en sgrh_comprobantes_pago. Esa fila la crea
-- marcarDetallePagado al marcar el pago, pero:
--   - los pagos marcados antes del 03/09/2026 nunca la tuvieron, y
--   - si el insert fallaba, el pago quedaba marcado sin código.
-- Esos pagos salían sin código en el comprobante y no había forma de
-- encontrarlos. Esta migración les emite uno.
--
-- Mismo formato que generarCodigoVerificacion (lib/comprobante.ts):
-- XXXX-XXXX-XXXX con el alfabeto sin I, L, O, 0 ni 1. Los bytes salen de
-- gen_random_uuid() (aleatorio fuerte, en el core desde PostgreSQL 13),
-- saltando los dos bytes de versión y variante del UUID.
--
-- Idempotente: solo toca pagos marcados sin comprobante. Correrla de nuevo
-- no hace nada.
-- =====================================================================

DO $$
DECLARE
  v_alfabeto CONSTANT text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  -- Posiciones del UUID (16 bytes) que son aleatorias: la 6 y la 8 no.
  v_posiciones CONSTANT int[] := ARRAY[0, 1, 2, 3, 4, 5, 7, 9, 10, 11, 12, 13];
  v_fila record;
  v_bytes bytea;
  v_letras text;
  v_codigo text;
  v_emitidos int := 0;
BEGIN
  FOR v_fila IN
    SELECT d.ndt_id, d.ndt_fecha_pago
    FROM public.sgrh_nomina_detalle d
    WHERE d.ndt_pagado
      AND NOT EXISTS (
        SELECT 1 FROM public.sgrh_comprobantes_pago c
        WHERE c.com_nomina_detalle_id = d.ndt_id
      )
    ORDER BY d.ndt_id
  LOOP
    LOOP
      v_bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
      SELECT string_agg(substr(v_alfabeto, 1 + get_byte(v_bytes, p) % 31, 1), '' ORDER BY i)
        INTO v_letras
        FROM unnest(v_posiciones) WITH ORDINALITY AS t(p, i);
      v_codigo := substr(v_letras, 1, 4) || '-' || substr(v_letras, 5, 4) || '-' || substr(v_letras, 9, 4);

      -- Choque con otro código (casi imposible): se intenta con otro.
      CONTINUE WHEN EXISTS (
        SELECT 1 FROM public.sgrh_comprobantes_pago WHERE com_codigo_verificacion = v_codigo
      );

      INSERT INTO public.sgrh_comprobantes_pago (
        com_nomina_detalle_id, com_codigo_verificacion, com_fecha_emision
      ) VALUES (
        v_fila.ndt_id, v_codigo, COALESCE(v_fila.ndt_fecha_pago::timestamp, now())
      );
      v_emitidos := v_emitidos + 1;
      EXIT;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Comprobantes emitidos para pagos sin código: %', v_emitidos;
END
$$;
