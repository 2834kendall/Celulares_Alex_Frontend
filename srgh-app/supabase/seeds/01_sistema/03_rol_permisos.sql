-- =====================================================================
-- Seed de sistema: matriz rol → permiso
-- =====================================================================
-- El archivo más importante del repo desde el punto de vista de seguridad:
-- decide qué puede hacer cada rol. Lo lee custom_access_token_hook para armar
-- el claim `permisos` del JWT en cada login.
--
-- Se siembra de forma DECLARATIVA (lista de pares + join por código) en vez
-- de con sgrh_private.asignar_permisos(): así el diff de un PR muestra
-- exactamente qué permiso gana o pierde cada rol, que es justo lo que hay que
-- poder revisar.
--
-- Nota sobre EMPLEADO: no tiene NINGUNA fila, y es correcto. El acceso del
-- empleado a su propia información no pasa por permisos sino por las ramas
-- `emp_id = get_emp_id()` de las policies. Un permiso le daría acceso a los
-- datos de TODA la empresa.
--
-- Convergencia: la tabla NO tiene índice único sobre (rol, permiso), solo la
-- PK sobre rpe_id — que es generada, así que no hay conflicto que detectar y
-- un ON CONFLICT DO NOTHING no serviría de nada: el segundo push duplicaría
-- las filas. Por eso el anti-join explícito de abajo.
-- =====================================================================

INSERT INTO public.sgrh_rol_permisos (rpe_rol_id, rpe_permiso_id)
SELECT r.rol_id, p.per_id
FROM (VALUES
  -- ── ADMIN: todo, acotado a su empresa por la RLS ───────────────────────
  ('ADMIN', 'EMPLEADOS_READ'),      ('ADMIN', 'EMPLEADOS_WRITE'),
  ('ADMIN', 'HISTORIAL_READ'),      ('ADMIN', 'HISTORIAL_WRITE'),
  ('ADMIN', 'NOMINA_READ'),         ('ADMIN', 'NOMINA_WRITE'),
  ('ADMIN', 'NOMINA_APPROVE'),      ('ADMIN', 'COMPROBANTES_READ'),
  ('ADMIN', 'ASISTENCIA_READ'),     ('ADMIN', 'ASISTENCIA_WRITE'),
  ('ADMIN', 'AUSENCIAS_READ'),      ('ADMIN', 'AUSENCIAS_WRITE'),
  ('ADMIN', 'AUSENCIAS_APPROVE'),   ('ADMIN', 'HORARIOS_READ'),
  ('ADMIN', 'HORARIOS_WRITE'),      ('ADMIN', 'RECLUTAMIENTO_READ'),
  ('ADMIN', 'RECLUTAMIENTO_WRITE'), ('ADMIN', 'EVALUACIONES_READ'),
  ('ADMIN', 'EVALUACIONES_WRITE'),  ('ADMIN', 'CATALOGOS_WRITE'),
  ('ADMIN', 'EMPRESAS_WRITE'),      ('ADMIN', 'ROLES_WRITE'),
  ('ADMIN', 'USUARIOS_WRITE'),      ('ADMIN', 'REPORTES_READ'),
  ('ADMIN', 'FOTOS_READ'),          ('ADMIN', 'DOCUMENTOS_READ'),
  ('ADMIN', 'DOCUMENTOS_WRITE'),

  -- ── RRHH: todo lo operativo de personas; no aprueba nómina ni toca config ─
  ('RRHH', 'EMPLEADOS_READ'),      ('RRHH', 'EMPLEADOS_WRITE'),
  ('RRHH', 'HISTORIAL_READ'),      ('RRHH', 'HISTORIAL_WRITE'),
  ('RRHH', 'NOMINA_READ'),         ('RRHH', 'NOMINA_WRITE'),
  ('RRHH', 'COMPROBANTES_READ'),   ('RRHH', 'ASISTENCIA_READ'),
  ('RRHH', 'ASISTENCIA_WRITE'),    ('RRHH', 'AUSENCIAS_READ'),
  ('RRHH', 'AUSENCIAS_WRITE'),     ('RRHH', 'AUSENCIAS_APPROVE'),
  ('RRHH', 'HORARIOS_READ'),       ('RRHH', 'HORARIOS_WRITE'),
  ('RRHH', 'RECLUTAMIENTO_READ'),  ('RRHH', 'RECLUTAMIENTO_WRITE'),
  ('RRHH', 'EVALUACIONES_READ'),   ('RRHH', 'EVALUACIONES_WRITE'),
  ('RRHH', 'REPORTES_READ'),       ('RRHH', 'FOTOS_READ'),
  ('RRHH', 'DOCUMENTOS_READ'),     ('RRHH', 'DOCUMENTOS_WRITE'),

  -- ── GERENTE / SUPERVISOR / JEFE_SUCURSAL: misma matriz operativa ─────────
  ('GERENTE', 'EMPLEADOS_READ'),      ('GERENTE', 'HISTORIAL_READ'),
  ('GERENTE', 'ASISTENCIA_READ'),     ('GERENTE', 'ASISTENCIA_WRITE'),
  ('GERENTE', 'AUSENCIAS_READ'),      ('GERENTE', 'AUSENCIAS_APPROVE'),
  ('GERENTE', 'HORARIOS_READ'),       ('GERENTE', 'HORARIOS_WRITE'),
  ('GERENTE', 'EVALUACIONES_READ'),   ('GERENTE', 'EVALUACIONES_WRITE'),
  ('GERENTE', 'REPORTES_READ'),       ('GERENTE', 'FOTOS_READ'),

  ('SUPERVISOR', 'EMPLEADOS_READ'),    ('SUPERVISOR', 'HISTORIAL_READ'),
  ('SUPERVISOR', 'ASISTENCIA_READ'),   ('SUPERVISOR', 'ASISTENCIA_WRITE'),
  ('SUPERVISOR', 'AUSENCIAS_READ'),    ('SUPERVISOR', 'AUSENCIAS_APPROVE'),
  ('SUPERVISOR', 'HORARIOS_READ'),     ('SUPERVISOR', 'HORARIOS_WRITE'),
  ('SUPERVISOR', 'EVALUACIONES_READ'), ('SUPERVISOR', 'EVALUACIONES_WRITE'),
  ('SUPERVISOR', 'REPORTES_READ'),     ('SUPERVISOR', 'FOTOS_READ'),

  ('JEFE_SUCURSAL', 'EMPLEADOS_READ'),    ('JEFE_SUCURSAL', 'HISTORIAL_READ'),
  ('JEFE_SUCURSAL', 'ASISTENCIA_READ'),   ('JEFE_SUCURSAL', 'ASISTENCIA_WRITE'),
  ('JEFE_SUCURSAL', 'AUSENCIAS_READ'),    ('JEFE_SUCURSAL', 'AUSENCIAS_APPROVE'),
  ('JEFE_SUCURSAL', 'HORARIOS_READ'),     ('JEFE_SUCURSAL', 'HORARIOS_WRITE'),
  ('JEFE_SUCURSAL', 'EVALUACIONES_READ'), ('JEFE_SUCURSAL', 'EVALUACIONES_WRITE'),
  ('JEFE_SUCURSAL', 'REPORTES_READ'),     ('JEFE_SUCURSAL', 'FOTOS_READ'),

  -- ── CONTADOR: nómina de punta a punta, personas solo de lectura ──────────
  ('CONTADOR', 'EMPLEADOS_READ'),    ('CONTADOR', 'HISTORIAL_READ'),
  ('CONTADOR', 'NOMINA_READ'),       ('CONTADOR', 'NOMINA_WRITE'),
  ('CONTADOR', 'NOMINA_APPROVE'),    ('CONTADOR', 'COMPROBANTES_READ'),
  ('CONTADOR', 'REPORTES_READ'),     ('CONTADOR', 'FOTOS_READ'),

  -- ── RECLUTADOR / EVALUADOR: acotados a su dominio ────────────────────────
  ('RECLUTADOR', 'EMPLEADOS_READ'),     ('RECLUTADOR', 'FOTOS_READ'),
  ('RECLUTADOR', 'RECLUTAMIENTO_READ'), ('RECLUTADOR', 'RECLUTAMIENTO_WRITE'),

  ('EVALUADOR', 'EMPLEADOS_READ'),    ('EVALUADOR', 'FOTOS_READ'),
  ('EVALUADOR', 'EVALUACIONES_READ'), ('EVALUADOR', 'EVALUACIONES_WRITE'),

  -- ── AUDITOR: solo lectura, transversal ──────────────────────────────────
  ('AUDITOR', 'EMPLEADOS_READ'),     ('AUDITOR', 'HISTORIAL_READ'),
  ('AUDITOR', 'NOMINA_READ'),        ('AUDITOR', 'COMPROBANTES_READ'),
  ('AUDITOR', 'ASISTENCIA_READ'),    ('AUDITOR', 'AUSENCIAS_READ'),
  ('AUDITOR', 'HORARIOS_READ'),      ('AUDITOR', 'RECLUTAMIENTO_READ'),
  ('AUDITOR', 'EVALUACIONES_READ'),  ('AUDITOR', 'REPORTES_READ'),
  ('AUDITOR', 'FOTOS_READ'),

  -- ── SOPORTE: solo configuración; cero acceso a datos de personas ─────────
  ('SOPORTE', 'CATALOGOS_WRITE'), ('SOPORTE', 'EMPRESAS_WRITE'),
  ('SOPORTE', 'ROLES_WRITE'),     ('SOPORTE', 'USUARIOS_WRITE'),

  -- ── KIOSCO: tablet compartida. El rol más restringido del sistema. ──────
  -- Exactamente dos permisos, y ninguno es de lectura general:
  --   ASISTENCIA_KIOSCO  ve solo empleados con asignación ACTIVA en SU sucursal
  --   ASISTENCIA_WRITE   registra la marca
  --
  -- Sin EMPLEADOS_READ (antes lo tenía): ese permiso le abría el expediente
  -- completo de toda la empresa desde un dispositivo físicamente expuesto con
  -- sesión permanente. Sin FOTOS_READ ni DOCUMENTOS_*: no debe poder firmar
  -- URLs de archivos. Sin ASISTENCIA_READ: registra marcas, no las consulta.
  ('KIOSCO', 'ASISTENCIA_KIOSCO'), ('KIOSCO', 'ASISTENCIA_WRITE')
) AS m(rol, permiso)
JOIN public.sgrh_cat_roles    r ON r.rol_codigo = m.rol
JOIN public.sgrh_cat_permisos p ON p.per_codigo = m.permiso
WHERE NOT EXISTS (
  SELECT 1 FROM public.sgrh_rol_permisos rp
  WHERE rp.rpe_rol_id = r.rol_id AND rp.rpe_permiso_id = p.per_id
);

SELECT setval(
  pg_get_serial_sequence('public.sgrh_rol_permisos', 'rpe_id'),
  COALESCE((SELECT MAX(rpe_id) FROM public.sgrh_rol_permisos), 1),
  true
);
