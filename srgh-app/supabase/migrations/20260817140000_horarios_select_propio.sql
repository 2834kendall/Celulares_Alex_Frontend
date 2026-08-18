-- "Mi Horario" (autoservicio): un empleado sin HORARIOS_READ necesita poder
-- resolver el nombre y las horas del turno referenciado por SU PROPIA fila
-- de sgrh_programacion_semanal (que ya es legible sin permiso, via la rama
-- prg_empleado_id = get_emp_id() de la policy "programacion_select") — sin
-- esto, ve el turno asignado pero no su detalle (nombre, horas de entrada,
-- almuerzo, break).
--
-- No amplia el acceso al catalogo en general: sigue exigiendo
-- HORARIOS_READ salvo por el turno puntual que el propio empleado tiene
-- asignado esta semana o en el pasado.
drop policy if exists "horarios_select" on public.sgrh_cat_horarios;

create policy "horarios_select" on public.sgrh_cat_horarios
  for select
  to authenticated
  using (
    hor_empresa_id = (select public.get_empresa_id())
    and (
      (select public.tiene_permiso('HORARIOS_READ'))
      or exists (
        select 1 from public.sgrh_programacion_semanal p
        where p.prg_horario_id = sgrh_cat_horarios.hor_id
          and p.prg_empleado_id = (select public.get_emp_id())
      )
    )
  );
