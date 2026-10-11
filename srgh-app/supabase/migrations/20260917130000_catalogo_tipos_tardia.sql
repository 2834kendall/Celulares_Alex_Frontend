-- =====================================================================
-- Catalogo de tipos de tardia, configurable por empresa
-- =====================================================================
-- Hasta ahora los cortes de la escala (leve 1-5 min, tardia 6-10, grave 11+)
-- vivian fijos en el codigo (lib/infractions.ts). Pasan a ser datos: cada
-- empresa define sus tipos desde Configuracion, con el minuto en que empieza
-- cada uno, si cuenta para la advertencia del mes y su color.
--
-- Reemplaza a suc_tolerancia_tardia_minutos: "a partir de que minuto hay
-- tardanza" es exactamente el minuto donde empieza el primer tipo. Mantener
-- las dos perillas permitia configurarlas en contra (tolerancia 5 con el
-- primer tipo empezando en 1 deja la banda leve inalcanzable), asi que la
-- tolerancia se elimina y queda una sola fuente de verdad.
--
-- Archivo idempotente: se puede re-ejecutar sin efectos.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabla
-- ---------------------------------------------------------------------
-- Cada tipo guarda SOLO el minuto donde empieza. Donde termina se deduce: un
-- minuto antes de que empiece el siguiente, y el ultimo queda abierto. Con un
-- rango "desde-hasta" el administrador podia dejar huecos (1-5 y 8-10: ¿que
-- es el minuto 7?) o solapamientos (1-6 y 5-10), y habia que validarlo todo;
-- guardando solo el comienzo es imposible configurarlo mal. Lo unico que hay
-- que impedir es que dos tipos empiecen en el mismo minuto, y eso lo cubre la
-- restriccion unica.
create table if not exists public.sgrh_cat_tipos_tardia (
  tta_id                 integer generated always as identity primary key,
  tta_empresa_id         integer not null,
  tta_nombre             character varying not null,
  tta_desde_minutos      integer not null,
  tta_cuenta_advertencia boolean not null default true,
  tta_color              text,
  tta_created_at         timestamp without time zone not null default now(),
  constraint sgrh_cat_tta_empresa_id_fkey
    foreign key (tta_empresa_id) references public.sgrh_empresas (org_id),
  constraint sgrh_cat_tta_desde_minutos_positivo check (tta_desde_minutos >= 1),
  constraint sgrh_cat_tta_color_hex check (tta_color is null or tta_color ~ '^#[0-9a-fA-F]{6}$'),
  constraint sgrh_cat_tta_empresa_desde_unique unique (tta_empresa_id, tta_desde_minutos)
);

comment on table public.sgrh_cat_tipos_tardia is
  'Tipos de tardia de cada empresa. Cada uno empieza en tta_desde_minutos de atraso y llega hasta un minuto antes del siguiente; el ultimo queda abierto. Un atraso por debajo del primer tipo no es tardanza.';
comment on column public.sgrh_cat_tipos_tardia.tta_desde_minutos is
  'Minuto de atraso desde el que una entrada cae en este tipo. Unico por empresa.';
comment on column public.sgrh_cat_tipos_tardia.tta_cuenta_advertencia is
  'Si una tardanza de este tipo suma al conteo del mes que dispara la advertencia. En false se sigue viendo en el reporte, pero no suma.';
comment on column public.sgrh_cat_tipos_tardia.tta_color is
  'Color hex con el que se pinta el tipo en el panel diario y el resumen mensual. NULL usa el color por defecto.';

-- ---------------------------------------------------------------------
-- 2. RLS — mismo esquema que sgrh_cat_puestos
-- ---------------------------------------------------------------------
-- Lectura para cualquier autenticado de la empresa: la necesitan el panel de
-- asistencia y el resumen mensual, no solo Configuracion. Escritura con
-- CATALOGOS_WRITE, igual que el resto de catalogos editables.
alter table public.sgrh_cat_tipos_tardia enable row level security;

drop policy if exists "tipos_tardia_select" on public.sgrh_cat_tipos_tardia;
create policy "tipos_tardia_select" on public.sgrh_cat_tipos_tardia for select to authenticated
using (tta_empresa_id = (select public.get_empresa_id()));

drop policy if exists "tipos_tardia_insert" on public.sgrh_cat_tipos_tardia;
create policy "tipos_tardia_insert" on public.sgrh_cat_tipos_tardia for insert to authenticated
with check (
  tta_empresa_id = (select public.get_empresa_id())
  and (select public.tiene_permiso('CATALOGOS_WRITE'))
);

drop policy if exists "tipos_tardia_update" on public.sgrh_cat_tipos_tardia;
create policy "tipos_tardia_update" on public.sgrh_cat_tipos_tardia for update to authenticated
using (
  tta_empresa_id = (select public.get_empresa_id())
  and (select public.tiene_permiso('CATALOGOS_WRITE'))
)
with check (
  tta_empresa_id = (select public.get_empresa_id())
  and (select public.tiene_permiso('CATALOGOS_WRITE'))
);

drop policy if exists "tipos_tardia_delete" on public.sgrh_cat_tipos_tardia;
create policy "tipos_tardia_delete" on public.sgrh_cat_tipos_tardia for delete to authenticated
using (
  tta_empresa_id = (select public.get_empresa_id())
  and (select public.tiene_permiso('CATALOGOS_WRITE'))
);

-- ---------------------------------------------------------------------
-- 3. Tipos por defecto
-- ---------------------------------------------------------------------
-- Los mismos cortes que pidio el cliente y que hasta hoy estaban en el
-- codigo: el dia que esto entra, nada cambia a la vista, solo pasa a ser
-- editable.
insert into public.sgrh_cat_tipos_tardia
  (tta_empresa_id, tta_nombre, tta_desde_minutos, tta_cuenta_advertencia, tta_color)
select e.org_id, v.nombre, v.desde, true, v.color
from public.sgrh_empresas e
cross join (values
  ('Tardia leve',  1,  '#F59E0B'),
  ('Tardia',       6,  '#EA580C'),
  ('Tardia grave', 11, '#E11D48')
) as v (nombre, desde, color)
on conflict (tta_empresa_id, tta_desde_minutos) do nothing;

-- Toda empresa nueva nace con los mismos tres tipos. Una empresa SIN tipos no
-- registraria ninguna tardanza, en silencio — preferible que eso no pueda
-- pasar. SECURITY DEFINER porque quien crea la empresa no tiene por que tener
-- CATALOGOS_WRITE, y la politica de insert lo exigiria.
create or replace function public.sgrh_crear_tipos_tardia_por_defecto()
returns trigger as $$
begin
  insert into public.sgrh_cat_tipos_tardia
    (tta_empresa_id, tta_nombre, tta_desde_minutos, tta_cuenta_advertencia, tta_color)
  values
    (new.org_id, 'Tardia leve',  1,  true, '#F59E0B'),
    (new.org_id, 'Tardia',       6,  true, '#EA580C'),
    (new.org_id, 'Tardia grave', 11, true, '#E11D48')
  on conflict (tta_empresa_id, tta_desde_minutos) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists sgrh_empresas_tipos_tardia_por_defecto on public.sgrh_empresas;
create trigger sgrh_empresas_tipos_tardia_por_defecto
  after insert on public.sgrh_empresas
  for each row execute function public.sgrh_crear_tipos_tardia_por_defecto();

-- ---------------------------------------------------------------------
-- 4. Adios a la tolerancia por sucursal
-- ---------------------------------------------------------------------
-- Su papel lo cumple ahora el minuto donde empieza el primer tipo. SGRH-87 ya
-- la habia dejado en 0 en todas las sucursales, asi que al eliminarla no se
-- pierde ninguna configuracion.
alter table public.sgrh_sucursales drop column if exists suc_tolerancia_tardia_minutos;
