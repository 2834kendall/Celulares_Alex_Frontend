-- =====================================================================
-- SGRH-88 — La tablet del kiosco y el empleado no escriben asistencia directo
-- =====================================================================
-- Auditoria de las politicas contra la base de demo, simulando la sesion de
-- una cuenta KIOSCO con los permisos del seed (ASISTENCIA_KIOSCO +
-- ASISTENCIA_WRITE):
--
--   * NO podia LEER programacion, contratos, empleados, rostros ni marcas
--     (cero filas en todas). Con una cuenta KIOSCO real el kiosco no
--     encontraba a nadie: siempre "Hoy no hay turnos".
--   * SI podia ESCRIBIR, porque marcas_insert y programacion_insert solo piden
--     ASISTENCIA_WRITE. La sesion de la tablet (expuesta en la tienda, abierta
--     siempre) podia insertar marcas sin Face ID o asignarse turnos llamando
--     a la API directamente.
--
-- Desde este ticket el kiosco no toca tablas: el servidor hace todo con el
-- cliente admin, despues de validar ASISTENCIA_KIOSCO y siempre acotado a la
-- empresa y a la sucursal de la cuenta (ver lib/kioskAccess.ts). El rol
-- KIOSCO queda con ESE unico permiso.
--
-- En demo el rol ni siquiera tenia ASISTENCIA_KIOSCO: el seed lo crea con
-- per_id 60, ese id ya lo ocupaba MI_HORARIO_READ, y el ON CONFLICT DO
-- NOTHING lo salteaba en silencio. El rol se quedo con lo viejo
-- (EMPLEADOS_READ + ASISTENCIA_WRITE). Por eso aca todo va por CODIGO, nunca
-- por id: el resultado es el mismo en cualquier entorno, desfasado o no.
--
-- De paso se cierran dos ramas de autoservicio que la app no usa y que
-- dejaban a cualquier empleado escribir sobre su propia asistencia:
--
--   * marcas_insert: "el propio empleado marcando para si mismo" permitia
--     insertarse marcas con cualquier hora, sin Face ID. Las marcas entran
--     solo por el kiosco (servidor) o por un encargado (marca manual).
--   * ausencias_insert: el empleado podia crear su ausencia ya "aprobada"
--     (la politica no miraba el estado). Desde SGRH-88 una ausencia aprobada
--     justifica el dia y bloquea el kiosco, asi que solo puede pedirla como
--     "pendiente", sin datos de aprobacion.
--
-- Nota: los permisos viajan en el JWT. Una tablet con sesion abierta conserva
-- ASISTENCIA_WRITE hasta que se refresca su token (en menos de una hora).
--
-- Archivo idempotente: se puede re-ejecutar sin efectos.
-- =====================================================================

-- ─── 1. KIOSCO: solo ASISTENCIA_KIOSCO ───────────────────────────────────
-- 1a. El permiso existe (por codigo; el id lo da la secuencia, alineada
--     primero con el maximo real para no chocar con ids sembrados a mano).
select setval(
  pg_get_serial_sequence('public.sgrh_cat_permisos', 'per_id'),
  coalesce((select max(per_id) from public.sgrh_cat_permisos), 1),
  true
);

insert into public.sgrh_cat_permisos (per_codigo, per_modulo, per_nombre, per_descripcion)
select 'ASISTENCIA_KIOSCO', 'asistencia', 'Operar kiosco de asistencia',
       'Operar la pantalla de marcas del kiosco de su sucursal'
where not exists (
  select 1 from public.sgrh_cat_permisos where per_codigo = 'ASISTENCIA_KIOSCO'
);

-- 1b. El rol lo tiene (anti-join: la tabla no tiene unico sobre rol+permiso).
insert into public.sgrh_rol_permisos (rpe_rol_id, rpe_permiso_id)
select r.rol_id, p.per_id
from public.sgrh_cat_roles r
join public.sgrh_cat_permisos p on p.per_codigo = 'ASISTENCIA_KIOSCO'
where r.rol_codigo = 'KIOSCO'
  and not exists (
    select 1 from public.sgrh_rol_permisos rp
    where rp.rpe_rol_id = r.rol_id and rp.rpe_permiso_id = p.per_id
  );

-- 1c. Y nada mas: ni ASISTENCIA_WRITE (escritura directa) ni EMPLEADOS_READ
--     (expediente completo de toda la empresa) ni lo que haya quedado de
--     configuraciones viejas.
delete from public.sgrh_rol_permisos rp
using public.sgrh_cat_roles r, public.sgrh_cat_permisos p
where rp.rpe_rol_id = r.rol_id
  and rp.rpe_permiso_id = p.per_id
  and r.rol_codigo = 'KIOSCO'
  and p.per_codigo <> 'ASISTENCIA_KIOSCO';

-- ─── 2. Marcas: solo quien registra por otros, dentro de su sucursal ─────
drop policy if exists "marcas_insert" on public.sgrh_marcas_asistencia;

create policy "marcas_insert" on public.sgrh_marcas_asistencia for insert to authenticated
with check (
  (select public.tiene_permiso('ASISTENCIA_WRITE'))
  and (select public.sucursal_visible(mar_sucursal_id))
  and mar_historial_laboral_id in (
    select lab_id
    from public.sgrh_historial_laboral
    where lab_empresa_id = (select public.get_empresa_id())
  )
);

-- ─── 3. Ausencias: el empleado solo pide, no se aprueba ──────────────────
drop policy if exists "ausencias_insert" on public.sgrh_ausencias;

create policy "ausencias_insert" on public.sgrh_ausencias for insert to authenticated
with check (
  -- El empleado solicitando su propia ausencia (sin permiso: el rol EMPLEADO
  -- no tiene ninguno a proposito), siempre como pendiente de aprobacion.
  (
    aus_estado = 'pendiente'
    and aus_aprobado_por_id is null
    and aus_fecha_aprobacion is null
    and aus_historial_laboral_id in (
      select lab_id
      from public.sgrh_historial_laboral
      where lab_empleado_id = (select public.get_emp_id())
        and lab_empresa_id = (select public.get_empresa_id())
    )
  )
  -- Quien aprueba, registrando por un empleado de su sucursal.
  or (
    (select public.tiene_permiso('AUSENCIAS_APPROVE'))
    and aus_historial_laboral_id in (
      select lab_id
      from public.sgrh_historial_laboral
      where lab_empresa_id = (select public.get_empresa_id())
        and (select public.sucursal_visible(lab_sucursal_id))
    )
  )
);
