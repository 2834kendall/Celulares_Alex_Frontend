-- Prepara el terreno para el modulo de Asistencia (SGRH-21) sin tocar el
-- hook de Auth ni las policies existentes (decision del equipo: la sucursal
-- del gerente se sigue resolviendo en runtime via uer_sucursal_id, no via JWT).
--
-- Contiene:
-- 1. Dos indices compuestos para las dos consultas reales del modulo.
-- 2. Tolerancia a tardias en sgrh_sucursales, parametrizable por sucursal.
--    El calculo que la usa queda diferido (fuera de este ticket); la columna
--    solo protege el margen para cuando se programe.
-- 3. Rol KIOSCO: solo puede leer empleados y registrar asistencia. Pensado
--    para una cuenta con sesion permanente por dispositivo de sucursal.
--
-- NO incluye un CHECK sobre mar_tipo: la tabla ya tenia filas de prueba con
-- 'entrada'/'salida' en minuscula (la convencion de mayusculas propuesta no
-- coincide con el resto del esquema, que usa minuscula en columnas de texto
-- equivalentes — ver ntf_tipo_notificacion, aus_estado, npe_estado). El
-- vocabulario de mar_tipo queda validado solo en la aplicacion (Zod, en
-- modules/attendance/types.ts), no en la base de datos.
--
-- Toda la migracion es convergente: puede re-ejecutarse sin errores.

-- ─── 1. Indices de rendimiento ────────────────────────────────────────────
-- Consulta del panel del gerente: marcas de una sucursal en un rango de fechas.
CREATE INDEX IF NOT EXISTS idx_marcas_sucursal_fecha
  ON public.sgrh_marcas_asistencia (mar_sucursal_id, mar_fecha_hora);

-- Consulta del historial del empleado: marcas de un contrato en un rango de fechas.
CREATE INDEX IF NOT EXISTS idx_marcas_historial_fecha
  ON public.sgrh_marcas_asistencia (mar_historial_laboral_id, mar_fecha_hora);

-- ─── 2. Tolerancia a tardias (parametrizada, calculo diferido) ────────────
ALTER TABLE public.sgrh_sucursales
  ADD COLUMN IF NOT EXISTS suc_tolerancia_tardia_minutos integer NOT NULL DEFAULT 2;

-- ─── 3. Rol KIOSCO ─────────────────────────────────────────────────────────
-- rol_activo = false a proposito: employees/getCatalogs.ts y
-- users/InviteUserForm filtran roles por rol_activo = true para poblar el
-- selector de "asignar rol a un usuario humano". Sin este flag, KIOSCO
-- apareceria ahi junto a ADMIN/RRHH/SUPERVISOR/EMPLEADO y alguien podria
-- asignarselo por error a una persona real. El rol sigue funcionando igual
-- para la cuenta del kiosco (ya creada de forma manual en Supabase); solo
-- deja de ofrecerse en los formularios pensados para personas.
INSERT INTO public.sgrh_cat_roles (rol_codigo, rol_nombre, rol_descripcion, rol_activo)
VALUES ('KIOSCO', 'Kiosco de asistencia', 'Cuenta de dispositivo compartido: solo registra marcas de asistencia', false)
ON CONFLICT (rol_codigo) DO NOTHING;

-- EMPLEADOS_READ: listar empleados activos en el buscador del kiosco y
-- resolver el contrato vigente (historial_select ya acepta este permiso).
-- ASISTENCIA_WRITE: insertar la marca. Deliberadamente SIN ASISTENCIA_READ:
-- el kiosco no necesita ver marcas de la empresa.
SELECT sgrh_private.asignar_permisos('KIOSCO', ARRAY[
  'EMPLEADOS_READ', 'ASISTENCIA_WRITE'
]);
