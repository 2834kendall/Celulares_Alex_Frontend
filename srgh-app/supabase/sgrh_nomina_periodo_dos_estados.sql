-- Migración: sgrh_nomina_periodo.npe_estado pasa a tener solo 2 valores
-- reales en uso: 'borrador' y 'pagado'. El estado 'aprobado' nunca tuvo una
-- forma de alcanzarse ni de salir desde la aplicación (no había ningún botón
-- que lo pusiera) — quedó como un valor "muerto" que solo se veía si alguien
-- lo puso a mano en el Table Editor. De ahora en adelante, la aplicación
-- misma recalcula el estado del periodo cada vez que se marca/desmarca el
-- pago de un empleado (ver sincronizarEstadoPeriodo en
-- marcarDetallePagado.ts): pasa a 'pagado' solo cuando TODOS los empleados
-- del periodo quedan pagados, y vuelve a 'borrador' si se desmarca alguno.
--
-- Ojo: algunos periodos viejos se guardaron con la palabra en FEMENINO
-- ("aprobada", "pagada") en vez de masculino ("aprobado", "pagado", que es
-- lo correcto para concordar con "el periodo"). El código solo reconoce las
-- formas en masculino, así que esta migración también normaliza esas filas
-- — si no, se ven en la pantalla como texto crudo sin traducir ni color.
--
-- Es seguro correr este archivo más de una vez (no pasa nada si ya no
-- quedan filas en 'aprobado'/'aprobada' — el UPDATE simplemente no afecta
-- ninguna fila).
--
-- Reglas:
--  - 'aprobado'/'aprobada': si YA tienen todos sus empleados pagados, pasan
--    a 'pagado' (con npe_fecha_pago = la fecha de pago más reciente entre
--    sus empleados, o la fecha de hoy si ninguno tiene fecha). Si no (o si
--    no tienen empleados todavía), vuelven a 'borrador'.
--  - 'pagada': ya está completo, solo se normaliza el texto a 'pagado' sin
--    tocar su npe_fecha_pago.

UPDATE public.sgrh_nomina_periodo AS p
SET
    npe_estado = 'pagado',
    npe_fecha_pago = COALESCE(
        p.npe_fecha_pago,
        (
            SELECT MAX(d.ndt_fecha_pago)
            FROM public.sgrh_nomina_detalle d
            WHERE d.ndt_nomina_periodo_id = p.npe_id
        ),
        CURRENT_DATE
    )
WHERE
    p.npe_estado IN ('aprobado', 'aprobada')
    AND EXISTS (
        SELECT 1
        FROM public.sgrh_nomina_detalle d
        WHERE d.ndt_nomina_periodo_id = p.npe_id
    )
    AND NOT EXISTS (
        SELECT 1
        FROM public.sgrh_nomina_detalle d
        WHERE
            d.ndt_nomina_periodo_id = p.npe_id
            AND d.ndt_pagado = false
    );

UPDATE public.sgrh_nomina_periodo
SET
    npe_estado = 'borrador'
WHERE
    npe_estado IN ('aprobado', 'aprobada');

UPDATE public.sgrh_nomina_periodo
SET
    npe_estado = 'pagado'
WHERE
    npe_estado = 'pagada';
