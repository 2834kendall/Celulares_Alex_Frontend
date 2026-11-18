-- Contratos con MÁS DE UNA fila de planilla en la misma quincena.
--
-- Con un periodo por sucursal esto podía pasar después de un traslado: a la
-- persona se le pagaba la quincena en la sucursal vieja y, al crear la misma
-- quincena en la sucursal nueva, se la cargaba otra vez. Es un posible pago
-- doble y lo tiene que revisar una persona.
--
-- Hay que correrla ANTES de la migración 20261118120000 (un periodo por
-- empresa): si devuelve filas, la migración se niega a fusionar los periodos.
-- Solo lee; no modifica nada.

SELECT p.npe_empresa_id                            AS empresa,
       p.npe_periodo_anio                          AS anio,
       p.npe_periodo_mes                           AS mes,
       p.npe_quincena                              AS quincena,
       d.ndt_historial_laboral_id                  AS contrato,
       concat_ws(' ', e.emp_nombre, e.emp_apellido_1, e.emp_apellido_2) AS empleado,
       count(*)                                    AS filas,
       count(*) FILTER (WHERE d.ndt_pagado)        AS pagadas,
       sum(d.ndt_salario_neto)                     AS neto_total,
       string_agg(
         format('periodo %s (%s): fila %s, %s', p.npe_id, s.suc_nombre, d.ndt_id,
                CASE WHEN d.ndt_pagado THEN 'pagada' ELSE 'sin pagar' END),
         ' | ' ORDER BY p.npe_id
       )                                           AS detalle
FROM public.sgrh_nomina_detalle d
JOIN public.sgrh_nomina_periodo p ON p.npe_id = d.ndt_nomina_periodo_id
JOIN public.sgrh_historial_laboral l ON l.lab_id = d.ndt_historial_laboral_id
JOIN public.sgrh_empleados e ON e.emp_id = l.lab_empleado_id
LEFT JOIN public.sgrh_sucursales s ON s.suc_id = d.ndt_sucursal_id
GROUP BY p.npe_empresa_id, p.npe_periodo_anio, p.npe_periodo_mes, p.npe_quincena,
         d.ndt_historial_laboral_id, e.emp_nombre, e.emp_apellido_1, e.emp_apellido_2
HAVING count(*) > 1
ORDER BY anio, mes, quincena, contrato;
