-- =====================================================================
-- SGRH-87 — Tardias: cuentan desde el primer minuto, y se pueden justificar
-- =====================================================================
-- Dos cambios independientes que viajan juntos porque sin el primero el
-- segundo casi no tiene de que ocuparse.
--
-- Archivo idempotente: se puede re-ejecutar sin efectos.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. La tolerancia baja a 0.
-- ---------------------------------------------------------------------
-- Pedido del cliente (2026-09-17): con turno a las 10:00, entrar 10:01 ya
-- es tardanza. La gradacion (leve 1-5 min, tardia 6-10, grave 11+) vive en
-- la aplicacion — ver lib/infractions.ts — pero es INALCANZABLE mientras
-- la sucursal conserve minutos de gracia: con los 5 que traia el seed, toda
-- la banda leve se la comia la tolerancia antes de llegar a clasificarse.
--
-- La columna NO se elimina: sigue siendo la palanca por sucursal si alguna
-- tienda necesita gracia. Lo que cambia es que el valor neutro pasa a ser 0
-- en vez de 2, para que una sucursal creada mañana no reintroduzca en
-- silencio una gracia que el cliente pidio quitar.
alter table sgrh_sucursales
  alter column suc_tolerancia_tardia_minutos set default 0;

update sgrh_sucursales
set suc_tolerancia_tardia_minutos = 0
where suc_tolerancia_tardia_minutos <> 0;

comment on column sgrh_sucursales.suc_tolerancia_tardia_minutos is
  'Minutos de gracia antes de contar una marca de entrada como tardia. 0 (el valor por defecto desde SGRH-87) significa que se cuenta desde el primer minuto; subirlo es una excepcion explicita de esa sucursal.';

-- ---------------------------------------------------------------------
-- 2. Justificacion de una tardanza puntual.
-- ---------------------------------------------------------------------
-- El encargado puede declarar que una tardanza no es responsabilidad del
-- colaborador: el sistema estaba caido y no pudo marcar aunque ya estaba en
-- tienda, o cualquier otro caso que el o el administrador analicen.
--
-- Va sobre la marca de ENTRADA, no sobre el dia: es esa marca concreta la
-- que llego tarde, y es la fila que el panel ya sabe identificar (mar_id
-- viaja al modal de correccion desde SGRH-21).
--
-- Una tardanza justificada SIGUE VIENDOSE en el reporte — solo deja de
-- sumar al conteo del mes y de disparar la advertencia. Ocultarla seria
-- perder la trazabilidad de que el atraso existio.
alter table sgrh_marcas_asistencia
  add column if not exists mar_tardia_justificada boolean not null default false,
  add column if not exists mar_tardia_justificacion character varying,
  add column if not exists mar_tardia_justificada_por_id integer,
  add column if not exists mar_tardia_justificada_at timestamp without time zone;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sgrh_asi_mar_tardia_justificada_por_id_fkey'
  ) then
    alter table sgrh_marcas_asistencia
      add constraint sgrh_asi_mar_tardia_justificada_por_id_fkey
      foreign key (mar_tardia_justificada_por_id) references sgrh_usuarios (usr_id);
  end if;
end $$;

-- Justificar exige un motivo, y quitar la justificacion no debe dejar
-- restos del anterior: las cuatro columnas van juntas o no van. Se exige en
-- la base y no solo en la aplicacion porque es la clase de invariante que
-- una correccion manual (saveManualMark hace UPDATE del payload completo)
-- puede romper sin querer.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sgrh_asi_mar_tardia_justificada_completa'
  ) then
    alter table sgrh_marcas_asistencia
      add constraint sgrh_asi_mar_tardia_justificada_completa check (
        (
          mar_tardia_justificada
          and mar_tardia_justificacion is not null
          and mar_tardia_justificada_por_id is not null
          and mar_tardia_justificada_at is not null
        )
        or (
          not mar_tardia_justificada
          and mar_tardia_justificacion is null
          and mar_tardia_justificada_por_id is null
          and mar_tardia_justificada_at is null
        )
      );
  end if;
end $$;

comment on column sgrh_marcas_asistencia.mar_tardia_justificada is
  'La tardanza de esta marca de entrada fue justificada por un encargado: se sigue mostrando en el reporte, pero no suma al conteo del mes ni dispara la advertencia. Solo tiene sentido en mar_tipo = ''entrada''.';
comment on column sgrh_marcas_asistencia.mar_tardia_justificacion is
  'Motivo escrito por quien justifico la tardanza (ej. "el sistema estaba caido, ya estaba en tienda").';
comment on column sgrh_marcas_asistencia.mar_tardia_justificada_por_id is
  'Usuario que justifico la tardanza. Se guarda aparte de mar_registrado_por_id: quien corrige una marca y quien justifica el atraso no tienen por que ser la misma persona.';
comment on column sgrh_marcas_asistencia.mar_tardia_justificada_at is
  'Momento en que se justifico, para auditar cuanto despues del hecho se hizo.';
