-- Apariencia por sucursal: color de acento (botones, nav activo, insignias,
-- enlaces) y color de la barra lateral. NULL = usa el default del sistema,
-- asi que ninguna sucursal existente cambia de aspecto hasta que alguien la
-- personalice desde Configuracion.
alter table sgrh_sucursales
  add column suc_color_acento text
    constraint sgrh_sucursales_color_acento_hex check (
      suc_color_acento is null or suc_color_acento ~ '^#[0-9a-fA-F]{6}$'
    ),
  add column suc_color_sidebar text
    constraint sgrh_sucursales_color_sidebar_hex check (
      suc_color_sidebar is null or suc_color_sidebar ~ '^#[0-9a-fA-F]{6}$'
    );
