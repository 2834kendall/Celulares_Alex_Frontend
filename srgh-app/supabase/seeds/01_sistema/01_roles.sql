-- =====================================================================
-- Seed de sistema: roles
-- =====================================================================
-- Esto NO es data de demo: es configuración. La aplicación asume que estos
-- códigos existen, y sin ellos nadie puede iniciar sesión de forma útil.
--
-- ── El modelo real de producción ────────────────────────────────────────
-- Solo cuatro roles nacen activos, y son los que el negocio usa:
--
--   ADMIN     toda su empresa (uer_sucursal_id NULL → sin restricción)
--   GERENTE   una sucursal    (uer_sucursal_id con valor → RLS lo acota)
--   EMPLEADO  solo lo suyo    (cero permisos, a propósito — ver 03_rol_permisos)
--   KIOSCO    solo marcar     (tablet compartida, el más restringido)
--
-- El resto queda INACTIVO: la matriz de permisos sigue documentada por si el
-- equipo crece, pero no se pueden asignar. Reactivar uno es un UPDATE.
--
-- ── SUPERADMIN ya no existe ─────────────────────────────────────────────
-- Tenía exactamente los mismos 27 permisos que ADMIN, y la RLS lo acotaba al
-- empresa_id de su JWT igual que a todos. O sea: prometía "acceso a todas las
-- empresas" y entregaba una sola. Un rol que miente sobre su alcance es peor
-- que no tenerlo, porque alguien va a construir asumiendo que funciona.
-- Multi-empresa se resuelve con varias filas en sgrh_usuarios_empresa_rol,
-- no con un rol especial.
--
-- OJO: quitarlo de este seed no lo borra de un proyecto que ya lo tenga. Si
-- hay usuarios con SUPERADMIN en producción, hay que repuntarlos a ADMIN
-- antes de eliminar la fila.
--
-- Los ids son explícitos (OVERRIDING SYSTEM VALUE) y se conservan los del
-- proyecto original — por eso falta el 1, que era SUPERADMIN.
-- =====================================================================

INSERT INTO public.sgrh_cat_roles (rol_id, rol_codigo, rol_nombre, rol_descripcion, rol_activo)
OVERRIDING SYSTEM VALUE
VALUES
  -- ── Activos: el modelo de producción ──────────────────────────────────
  (2,  'ADMIN',    'Administrador de Empresa', 'Administra una empresa y todas sus sucursales', true),
  (4,  'GERENTE',  'Gerente de Sucursal',      'Opera una sucursal: asistencia, ausencias, horarios y evaluaciones de su personal', true),
  (8,  'EMPLEADO', 'Empleado',                 'Acceso únicamente a su propia información', true),
  -- KIOSCO nace inactivo a propósito: se habilita solo cuando hay una tablet
  -- física montada. Es una cuenta de dispositivo compartido con sesión
  -- permanente, así que no debe existir "por si acaso".
  (13, 'KIOSCO',   'Kiosco de asistencia',     'Cuenta de dispositivo compartido: solo registra marcas de asistencia', false),

  -- ── Inactivos: definidos, no asignables ───────────────────────────────
  -- Se conservan con su matriz de permisos para no reconstruirla desde cero
  -- si el equipo crece. Activar = UPDATE sgrh_cat_roles SET rol_activo = true.
  (3,  'RRHH',          'Encargado de Recursos Humanos', 'Gestión de empleados, nómina y evaluaciones',      false),
  (5,  'SUPERVISOR',    'Supervisor de Sucursal',        'Supervisa una sucursal específica',                false),
  (6,  'CONTADOR',      'Contador / Nómina',             'Gestión de nómina y pagos',                        false),
  (7,  'RECLUTADOR',    'Reclutador',                    'Gestión de procesos de reclutamiento y selección', false),
  (9,  'AUDITOR',       'Auditor Interno',               'Consulta de reportes y auditoría',                 false),
  (10, 'JEFE_SUCURSAL', 'Jefe de Sucursal',              'Gestión operativa de una sucursal',                false),
  (11, 'SOPORTE',       'Soporte Técnico',               'Soporte y configuración del sistema',              false),
  (12, 'EVALUADOR',     'Evaluador de Desempeño',        'Realiza evaluaciones de desempeño',                false)
ON CONFLICT DO NOTHING;

-- Sin esto, el próximo rol creado desde la UI intentaría reusar el id 1.
SELECT setval(
  pg_get_serial_sequence('public.sgrh_cat_roles', 'rol_id'),
  COALESCE((SELECT MAX(rol_id) FROM public.sgrh_cat_roles), 1),
  true
);
