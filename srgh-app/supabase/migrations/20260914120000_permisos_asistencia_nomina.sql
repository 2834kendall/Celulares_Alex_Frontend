-- Nómina necesita LEER asistencia, horarios y ausencias.
--
-- Desde que las horas de la planilla salen de las marcas del kiosco, calcular
-- una quincena implica leer sgrh_programacion_semanal, sgrh_marcas_asistencia,
-- sgrh_cat_horarios y sgrh_ausencias. El rol CONTADOR —el único además de
-- ADMIN con NOMINA_WRITE— nunca tuvo esos permisos de lectura.
--
-- El síntoma no era un error, y por eso costó verlo: RLS FILTRA filas, no
-- lanza. Las consultas devolvían vacío, el cálculo daba 0 horas esperadas y 0
-- trabajadas, y eso se interpretaba como "no trabajó". Resultado: todos los
-- empleados en 0 h, los pagos bloqueados con "hoy las marcas dicen 0 h", y el
-- botón de traer horas ofreciendo "traer 0 h" — que de aplicarse borraba las
-- horas buenas y el movimiento pendiente del banco de horas.
--
-- Son permisos de LECTURA: el contador sigue sin poder marcar asistencia,
-- armar horarios ni aprobar ausencias.
--
-- Idempotente: se puede correr las veces que sea.

INSERT INTO public.sgrh_rol_permisos (rpe_rol_id, rpe_permiso_id)
SELECT r.rol_id, p.per_id
FROM (VALUES
  ('CONTADOR', 'ASISTENCIA_READ'),
  ('CONTADOR', 'HORARIOS_READ'),
  ('CONTADOR', 'AUSENCIAS_READ')
) AS m(rol, permiso)
JOIN public.sgrh_cat_roles    r ON r.rol_codigo = m.rol
JOIN public.sgrh_cat_permisos p ON p.per_codigo = m.permiso
WHERE NOT EXISTS (
  SELECT 1 FROM public.sgrh_rol_permisos rp
  WHERE rp.rpe_rol_id = r.rol_id AND rp.rpe_permiso_id = p.per_id
);
