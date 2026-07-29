-- Catalogo legal de tipos de ausencia para Costa Rica: incapacidades (CCSS/INS),
-- licencia de maternidad/paternidad y periodo de lactancia. sgrh_cat_tipos_ausencia
-- ya existia (con RLS listo) pero no tenia datos y ningun modulo la usaba.
-- tau_codigo es la clave que usa el frontend para decidir si el tipo reemplaza
-- el dia en la matriz de horarios (incapacidades/licencias) o si solo agrega
-- una insignia sobre el horario normal (PERM_LACTANCIA, permiso intradia).
INSERT INTO public.sgrh_cat_tipos_ausencia (
  tau_codigo,
  tau_nombre,
  tau_requiere_documento_ccss,
  tau_paga_empleador_dias,
  tau_porcentaje_pago_empleador,
  tau_paga_ccss_desde_dia,
  tau_porcentaje_subsidio_ccss,
  tau_descuenta_vacaciones,
  tau_es_protegida,
  tau_referencia_legal
)
VALUES
  (
    'INC_ENF_CCSS',
    'Incapacidad por enfermedad (CCSS)',
    true, 3, 50, 4, 60, false, false,
    'Reglamento del Seguro de Salud CCSS, arts. 36-40'
  ),
  (
    'INC_RIESGO_INS',
    'Incapacidad por riesgo del trabajo (INS)',
    true, 1, 100, 2, 60, false, true,
    'Codigo de Trabajo Titulo IV; Ley de Riesgos del Trabajo'
  ),
  (
    'LIC_MATERNIDAD',
    'Licencia por maternidad',
    true, 120, 50, 1, 50, false, true,
    'Codigo de Trabajo, arts. 94-95'
  ),
  (
    'LIC_PATERNIDAD',
    'Licencia de paternidad',
    true, 0, 0, 1, 100, false, true,
    'Ley 9822 (2020); Codigo de Trabajo art. 95 bis'
  ),
  (
    'PERM_LACTANCIA',
    'Periodo de lactancia',
    false, 0, 100, NULL, NULL, false, true,
    'Codigo de Trabajo, art. 97'
  )
ON CONFLICT (tau_codigo) DO NOTHING;
