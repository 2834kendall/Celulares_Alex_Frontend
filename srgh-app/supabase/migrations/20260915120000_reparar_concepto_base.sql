-- =====================================================================
-- Deja el concepto BASE en condiciones de recibir el salario de la quincena
-- =====================================================================
-- BASE es el único código que el motor de nómina conoce de memoria: el
-- prellenado desde asistencia y la plantilla de Excel escriben el salario ya
-- prorrateado en `montos.BASE` y el motor lo recoge buscándolo por código
-- (ver src/modules/payroll/lib/planilla.ts).
--
-- Necesita cuatro cosas a la vez: estar activo, ser del trabajador (no
-- patronal), ser de monto manual de ingreso y contar como salario bruto. Si
-- falla cualquiera, el monto queda huérfano: el motor no lo suma y la fila se
-- guarda en ₡0 CON las horas correctas. Es un cero indistinguible de "no
-- trabajó", y llegó a producción — 9 h trabajadas, 3 extra, total a pagar ₡0.
--
-- Las cuatro se podían romper desde Nómina → Conceptos sin ningún aviso. Ahora
-- el código lo impide (updateConcepto/deleteConcepto) y las acciones que arman
-- planilla lo verifican antes de escribir. Esto repara los catálogos que ya
-- quedaron rotos.
--
-- El seed (seeds/02_catalogos/04_nomina.sql) NO sirve para esto: usa
-- ON CONFLICT DO NOTHING, así que ve la fila existente y no la corrige.
--
-- Idempotente. No toca ningún otro concepto, ni ninguna planilla ya guardada:
-- las líneas apuntan a con_id, que no cambia.
-- =====================================================================

UPDATE public.sgrh_cat_conceptos_nomina
SET con_tipo                 = 'ingreso',
    con_tipo_calculo         = 'monto_manual_ingreso',
    -- El CHECK de la tabla exige NULL para los tipos de monto manual.
    con_porcentaje           = NULL,
    con_afecta_salario_bruto = true,
    con_afecta_base_ccss     = true,
    con_activo               = true
WHERE con_codigo = 'BASE';

-- Si no existe del todo (se borró, o se le cambió el código), se crea. con_id
-- lo asigna la identidad: no se fuerza el 21 del seed para no chocar con una
-- fila que ya use ese id.
INSERT INTO public.sgrh_cat_conceptos_nomina (
  con_codigo, con_nombre, con_tipo,
  con_afecta_salario_bruto, con_afecta_base_ccss,
  con_formula_base, con_activo, con_tipo_calculo, con_porcentaje
)
SELECT 'BASE', 'Salario base', 'ingreso', true, true, NULL, true, 'monto_manual_ingreso', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.sgrh_cat_conceptos_nomina WHERE con_codigo = 'BASE'
);
