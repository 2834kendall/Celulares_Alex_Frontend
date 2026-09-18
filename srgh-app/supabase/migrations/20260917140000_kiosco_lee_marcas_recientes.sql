-- =====================================================================
-- SGRH-88 — El kiosco puede leer las marcas recientes de su sucursal
-- =====================================================================
-- El kiosco ahora ofrece solo la marca que corresponde (sin marcas: solo
-- Entrada; con el almuerzo abierto: solo su fin; etc.), y el servidor rechaza
-- las que no corresponden. Para eso necesita saber que marco cada persona hoy.
--
-- La cuenta KIOSCO no podia: "marcas_select" exige ASISTENCIA_READ, que el rol
-- KIOSCO no tiene a proposito (le abriria todo el historial). Y RLS no falla,
-- devuelve cero filas — el kiosco habria creido que nadie marco nada nunca y
-- ofrecido "Entrada" para siempre.
--
-- En vez de darle ASISTENCIA_READ, una politica estrecha: solo con
-- ASISTENCIA_KIOSCO, solo las sucursales asignadas a la cuenta, y solo
-- marcas de HOY y AYER.
-- Ayer porque la cola offline puede sincronizar al dia siguiente una marca
-- hecha sin red, y validar su secuencia exige ver las marcas de ese dia.
--
-- Las politicas SELECT son permisivas: esta se SUMA a "marcas_select", no la
-- reemplaza. Quien ya podia leer, sigue pudiendo.
--
-- Archivo idempotente: se puede re-ejecutar sin efectos.
-- =====================================================================

drop policy if exists "marcas_select_kiosco" on public.sgrh_marcas_asistencia;

create policy "marcas_select_kiosco" on public.sgrh_marcas_asistencia for select to authenticated
using (
  (select public.tiene_permiso('ASISTENCIA_KIOSCO'))
  -- La sucursal sale de la asignacion del usuario en la tabla, NO de
  -- sucursal_visible(): esa funcion lee sucursal_ids del JWT y trata su
  -- ausencia como "toda la empresa" (lo correcto para ADMIN/RRHH). Si el hook
  -- no emite el claim, o una cuenta KIOSCO quedo sin sucursal, el kiosco
  -- leeria las marcas de todas las sucursales. Aca, sin una fila activa con
  -- sucursal concreta, no ve nada. uer_select deja leer la asignacion propia.
  and exists (
    select 1
    from public.sgrh_usuarios_empresa_rol uer
    where uer.uer_usuario_id = (select public.get_usr_id())
      and uer.uer_activo
      and uer.uer_empresa_id = (select public.get_empresa_id())
      and uer.uer_sucursal_id = mar_sucursal_id
  )
  -- mar_fecha_hora es la hora de pared de Costa Rica sin zona: se compara
  -- contra la fecha de Costa Rica, no la del servidor (UTC).
  and mar_fecha_hora >= (select ((now() at time zone 'America/Costa_Rica')::date - 1))
);

comment on policy "marcas_select_kiosco" on public.sgrh_marcas_asistencia is
  'SGRH-88: el kiosco lee las marcas de hoy y ayer de su sucursal para ofrecer solo la marca que corresponde en la secuencia de la jornada.';
