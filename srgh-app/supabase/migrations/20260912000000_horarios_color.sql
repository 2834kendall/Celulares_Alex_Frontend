-- Color propio de plantilla de horario: permite distinguir un turno de un
-- vistazo en la matriz semanal ademas del color automatico por hor_id. NULL
-- = sigue usando el color automatico, asi que ningun horario existente
-- cambia de aspecto hasta que alguien le asigne uno desde el formulario.
alter table sgrh_cat_horarios
  add column hor_color text
    constraint sgrh_cat_horarios_color_hex check (
      hor_color is null or hor_color ~ '^#[0-9a-fA-F]{6}$'
    );
