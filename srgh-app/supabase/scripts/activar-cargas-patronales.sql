-- =====================================================================
-- Activar la carga patronal de la CCSS
-- =====================================================================
-- Se corre UNA vez, después de aplicar la migración
-- 20260912140000_concepto_porcentaje_patronal.sql.
--
-- Qué son las cargas patronales: lo que la EMPRESA le paga a la CCSS y a
-- las demás instituciones POR ENCIMA del salario. No se le rebajan a
-- nadie, no cambian el salario neto ni el aguinaldo. Sirven para saber
-- cuánto cuesta realmente la planilla y para cuadrar contra la factura
-- que llega de la CCSS.
--
-- Este script deja calculándose solo la de la CCSS (PAT001). Las otras
-- tres —INS riesgos del trabajo, Banco Popular, FODESAF/IMAS/INA— se
-- quedan como están y no calculan nada. El día que el cliente las
-- necesite no hay que volver acá: en Nómina → Conceptos se les cambia el
-- tipo de cálculo a "% del salario bruto — lo paga la empresa", se les
-- escribe el porcentaje y empiezan a calcularse solas.
--
-- Cómo correrlo: SQL Editor → New query → pegar TODO → Run.
-- =====================================================================


-- ── 1. CCSS patronal: tipo de cálculo y porcentaje ───────────────────
-- 14,83% = SEM 9,25% + IVM 5,58%.
--
-- CONFIRMAR el número con la contabilidad del cliente antes de darlo por
-- bueno: lo cambia la ley cada cierto tiempo. Desde la pantalla de
-- Conceptos se edita sin volver a correr esto.
--
-- El filtro por con_tipo_calculo es lo que lo hace repetible: si alguien
-- ya le puso otro porcentaje desde la pantalla, este script no se lo pisa.

UPDATE public.sgrh_cat_conceptos_nomina
SET con_tipo_calculo = 'porcentaje_patronal_bruto',
    con_porcentaje   = 14.830,
    con_activo       = true
WHERE con_codigo = 'PAT001'
  AND con_tipo_calculo <> 'porcentaje_patronal_bruto';


-- ── 2. Cómo quedó el catálogo patronal (no cambia nada) ──────────────
-- La de la CCSS con su porcentaje; las otras tres en su tipo manual,
-- esperando a que alguien decida usarlas.

SELECT
  con_codigo,
  con_nombre,
  con_tipo_calculo,
  con_porcentaje,
  con_activo
FROM public.sgrh_cat_conceptos_nomina
WHERE con_tipo = 'patronal'
ORDER BY con_codigo;


-- ── 3. Qué periodos se van a actualizar (no cambia nada) ─────────────
-- Los periodos YA PAGADOS no se tocan: su planilla es historia y las
-- cargas de entonces no se pueden inventar hacia atrás, así que quedan
-- en 0 — que es lo que se guardó en su momento.
--
-- Los que siguen en borrador se recalculan solos la próxima vez que
-- alguien suba el Excel o edite un detalle del periodo. Esta consulta
-- muestra cuáles son, para saber qué falta volver a guardar.

SELECT
  p.npe_id                           AS periodo,
  p.npe_periodo_anio                 AS anio,
  p.npe_periodo_mes                  AS mes,
  p.npe_quincena                     AS quincena,
  COUNT(d.ndt_id)                    AS empleados,
  SUM(d.ndt_total_cargas_patronales) AS patronales_guardadas
FROM public.sgrh_nomina_periodo p
JOIN public.sgrh_nomina_detalle d ON d.ndt_nomina_periodo_id = p.npe_id
WHERE p.npe_estado = 'borrador'
GROUP BY 1, 2, 3, 4
ORDER BY anio, mes, quincena;
