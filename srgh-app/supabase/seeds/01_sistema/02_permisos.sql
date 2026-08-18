-- =====================================================================
-- Seed de sistema: catálogo de permisos
-- =====================================================================
-- Los códigos de acá tienen que coincidir exactamente con la constante
-- PERMISOS de src/lib/permissions: es el contrato entre la base y la app.
-- Agregar un permiso implica tocar los dos lados.
--
-- Los ids arrancan en 33 y no en 1 porque el catálogo se recreó una vez en
-- el proyecto original. Se respeta el numerado real para que los entornos
-- sean comparables; no hay ningún significado en el número.
-- =====================================================================

INSERT INTO public.sgrh_cat_permisos (per_id, per_codigo, per_modulo, per_nombre, per_descripcion)
OVERRIDING SYSTEM VALUE
VALUES
  (33, 'EMPLEADOS_READ',      'empleados',     'Ver empleados',                     'Consultar información de empleados'),
  (34, 'EMPLEADOS_WRITE',     'empleados',     'Editar empleados',                  'Crear y editar información de empleados'),
  (35, 'HISTORIAL_READ',      'historial',     'Ver historial laboral',             'Consultar historial laboral'),
  (36, 'HISTORIAL_WRITE',     'historial',     'Editar historial laboral',          'Crear y editar historial laboral'),
  (37, 'NOMINA_READ',         'nomina',        'Ver nómina',                        'Consultar períodos y detalles de nómina'),
  (38, 'NOMINA_WRITE',        'nomina',        'Editar nómina',                     'Crear y editar períodos de nómina'),
  (39, 'NOMINA_APPROVE',      'nomina',        'Aprobar nómina',                    'Aprobar períodos de nómina para pago'),
  (40, 'COMPROBANTES_READ',   'nomina',        'Ver comprobantes de pago',          'Consultar comprobantes de pago'),
  (41, 'ASISTENCIA_READ',     'asistencia',    'Ver asistencia',                    'Consultar marcas de asistencia'),
  (42, 'ASISTENCIA_WRITE',    'asistencia',    'Registrar asistencia',              'Registrar marcas de asistencia'),
  (43, 'AUSENCIAS_READ',      'ausencias',     'Ver ausencias',                     'Consultar solicitudes de ausencia'),
  (44, 'AUSENCIAS_WRITE',     'ausencias',     'Solicitar ausencias',               'Crear solicitudes de ausencia'),
  (45, 'AUSENCIAS_APPROVE',   'ausencias',     'Aprobar ausencias',                 'Aprobar o rechazar solicitudes de ausencia'),
  (46, 'HORARIOS_READ',       'horarios',      'Ver horarios',                      'Consultar horarios y programación'),
  (47, 'HORARIOS_WRITE',      'horarios',      'Editar horarios',                   'Crear y editar horarios y programación'),
  (48, 'RECLUTAMIENTO_READ',  'reclutamiento', 'Ver reclutamiento',                 'Consultar candidatos y postulaciones'),
  (49, 'RECLUTAMIENTO_WRITE', 'reclutamiento', 'Editar reclutamiento',              'Gestionar candidatos y postulaciones'),
  (50, 'EVALUACIONES_READ',   'evaluaciones',  'Ver evaluaciones',                  'Consultar evaluaciones de desempeño'),
  (51, 'EVALUACIONES_WRITE',  'evaluaciones',  'Editar evaluaciones',               'Crear y editar evaluaciones de desempeño'),
  (52, 'CATALOGOS_WRITE',     'configuracion', 'Editar catálogos',                  'Administrar catálogos del sistema'),
  (53, 'EMPRESAS_WRITE',      'configuracion', 'Editar empresas',                   'Administrar empresas y sucursales'),
  (54, 'ROLES_WRITE',         'configuracion', 'Editar roles',                      'Administrar roles y permisos'),
  (55, 'USUARIOS_WRITE',      'configuracion', 'Editar usuarios',                   'Administrar usuarios del sistema'),
  (56, 'REPORTES_READ',       'reportes',      'Ver reportes',                      'Consultar reportes del sistema'),
  -- Los tres de storage son permisos PROPIOS, no derivados de EMPLEADOS_*:
  -- un dispositivo compartido no debe poder firmar URLs de archivos.
  (57, 'FOTOS_READ',          'storage',       'Ver fotos de empleados',            NULL),
  (58, 'DOCUMENTOS_READ',     'storage',       'Ver documentos de empleados',       NULL),
  (59, 'DOCUMENTOS_WRITE',    'storage',       'Gestionar documentos de empleados', NULL),
  -- Permiso estrecho del kiosco. Reemplaza a EMPLEADOS_READ en ese rol: con
  -- EMPLEADOS_READ la policy empleados_select le exponía el expediente completo
  -- (cédula, nacimiento, teléfono, email, CCSS, contacto de emergencia) de TODA
  -- la empresa, desde una tablet con sesión permanente. Con este, la policy
  -- solo le muestra empleados con asignación ACTIVA en su propia sucursal.
  (60, 'ASISTENCIA_KIOSCO',   'asistencia',    'Operar kiosco de asistencia',
       'Ver el listado de empleados de la sucursal del kiosco para poder marcar'),
  -- Autoservicio: permiso angosto para que un empleado vea SU PROPIO horario
  -- (pantalla "Mi Horario"). La RLS de sgrh_programacion_semanal ya deja
  -- pasar las filas propias sin ningun permiso — este solo habilita esa
  -- pantalla en el shell, nunca amplia lo que la RLS ya permite ver.
  (61, 'MI_HORARIO_READ',     'horarios',      'Ver mi horario',
       'Consultar el propio horario y programación semanal, sin ver el de otros')
ON CONFLICT DO NOTHING;

SELECT setval(
  pg_get_serial_sequence('public.sgrh_cat_permisos', 'per_id'),
  COALESCE((SELECT MAX(per_id) FROM public.sgrh_cat_permisos), 1),
  true
);
