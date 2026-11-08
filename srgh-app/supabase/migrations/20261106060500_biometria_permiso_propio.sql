-- SGRH-102: el enrolamiento facial pasa a tener su propio permiso.
--
-- Hasta ahora las policies de escritura de sgrh_biometria_empleado pedian
-- EMPLEADOS_WRITE, que GERENTE no tiene: en la practica solo el ADMIN podia
-- registrar rostros, aunque el codigo dijera "solo gerentes". Darle
-- EMPLEADOS_WRITE al gerente le abriria la edicion completa del expediente
-- (datos personales, cuenta bancaria), asi que el enrolamiento usa un permiso
-- angosto: BIOMETRIA_WRITE. El permiso y su asignacion a ADMIN y GERENTE viven
-- en los seeds (01_sistema/02_permisos.sql y 03_rol_permisos.sql).
--
-- De paso se cierra un hueco que el permiso nuevo habria abierto: las policies
-- de escritura solo miraban la EMPRESA. Un gerente podia escribir el vector
-- de un empleado de otra sucursal llamando a la API directamente. Ahora la
-- escritura tiene el mismo alcance que la lectura: quien opera a nivel empresa
-- (get_sucursal_ids() NULL, el ADMIN) toca cualquier empleado de su empresa;
-- quien esta adscrito a sucursales, solo a su personal con contrato vigente.
--
-- La rama del ADMIN no exige contrato vigente a proposito: es la que permite
-- borrar el vector de alguien que ya se fue.
--
-- OJO: la subconsulta sobre sgrh_historial_laboral corre con la RLS de ESA
-- tabla, que pide HISTORIAL_READ o EMPLEADOS_READ. Un rol con BIOMETRIA_WRITE
-- y sin ninguno de los dos no veria a nadie y no podria enrolar: no da error
-- de configuracion, da 42501 como si el empleado fuera de otra sucursal.
-- Todos los roles sembrados con BIOMETRIA_WRITE tienen EMPLEADOS_READ, y el
-- perfil del empleado (unico punto de entrada) ya lo exige.
--
-- Probado con la receta de rpc-rls-test contra dev (transaccion + ROLLBACK):
-- 11 casos en verde, y al quitar la clausula de sucursal el gerente vuelve a
-- poder escribir el vector de otra sucursal.
--
-- Va en una transaccion: entre el DROP y el CREATE de cada policy la tabla
-- quedaria sin esa regla, y la CLI no envuelve el archivo por su cuenta.

BEGIN;

DROP POLICY IF EXISTS "biometria_select" ON public.sgrh_biometria_empleado;
CREATE POLICY "biometria_select" ON public.sgrh_biometria_empleado
  FOR SELECT TO authenticated
  USING (
    bio_empresa_id = (SELECT public.get_empresa_id())
    AND (
      (SELECT public.tiene_permiso('ASISTENCIA_WRITE'))
      OR (SELECT public.tiene_permiso('BIOMETRIA_WRITE'))
    )
    -- Los vectores faciales son el dato más sensible de la tabla: un usuario
    -- adscrito a una o varias sucursales (kiosco, gerente) solo lee los de
    -- SU personal activo. Quien opera a nivel empresa (ADMIN) no queda
    -- restringido.
    AND (
      public.get_sucursal_ids() IS NULL
      OR bio_empleado_id IN (
        SELECT lab_empleado_id
        FROM public.sgrh_historial_laboral
        WHERE lab_empresa_id = (SELECT public.get_empresa_id())
          AND lab_fecha_fin IS NULL
          AND lab_sucursal_id = ANY (public.get_sucursal_ids())
      )
    )
  );

DROP POLICY IF EXISTS "biometria_insert" ON public.sgrh_biometria_empleado;
CREATE POLICY "biometria_insert" ON public.sgrh_biometria_empleado
  FOR INSERT TO authenticated
  WITH CHECK (
    bio_empresa_id = (SELECT public.get_empresa_id())
    AND (SELECT public.tiene_permiso('BIOMETRIA_WRITE'))
    AND (
      public.get_sucursal_ids() IS NULL
      OR bio_empleado_id IN (
        SELECT lab_empleado_id
        FROM public.sgrh_historial_laboral
        WHERE lab_empresa_id = (SELECT public.get_empresa_id())
          AND lab_fecha_fin IS NULL
          AND lab_sucursal_id = ANY (public.get_sucursal_ids())
      )
    )
  );

-- USING y WITH CHECK iguales: el upsert de enrollFace pasa por aca cuando el
-- empleado ya tenia vector, y no debe poder mover la fila a otro empleado ni
-- a otra empresa.
DROP POLICY IF EXISTS "biometria_update" ON public.sgrh_biometria_empleado;
CREATE POLICY "biometria_update" ON public.sgrh_biometria_empleado
  FOR UPDATE TO authenticated
  USING (
    bio_empresa_id = (SELECT public.get_empresa_id())
    AND (SELECT public.tiene_permiso('BIOMETRIA_WRITE'))
    AND (
      public.get_sucursal_ids() IS NULL
      OR bio_empleado_id IN (
        SELECT lab_empleado_id
        FROM public.sgrh_historial_laboral
        WHERE lab_empresa_id = (SELECT public.get_empresa_id())
          AND lab_fecha_fin IS NULL
          AND lab_sucursal_id = ANY (public.get_sucursal_ids())
      )
    )
  )
  WITH CHECK (
    bio_empresa_id = (SELECT public.get_empresa_id())
    AND (SELECT public.tiene_permiso('BIOMETRIA_WRITE'))
    AND (
      public.get_sucursal_ids() IS NULL
      OR bio_empleado_id IN (
        SELECT lab_empleado_id
        FROM public.sgrh_historial_laboral
        WHERE lab_empresa_id = (SELECT public.get_empresa_id())
          AND lab_fecha_fin IS NULL
          AND lab_sucursal_id = ANY (public.get_sucursal_ids())
      )
    )
  );

DROP POLICY IF EXISTS "biometria_delete" ON public.sgrh_biometria_empleado;
CREATE POLICY "biometria_delete" ON public.sgrh_biometria_empleado
  FOR DELETE TO authenticated
  USING (
    bio_empresa_id = (SELECT public.get_empresa_id())
    AND (SELECT public.tiene_permiso('BIOMETRIA_WRITE'))
    AND (
      public.get_sucursal_ids() IS NULL
      OR bio_empleado_id IN (
        SELECT lab_empleado_id
        FROM public.sgrh_historial_laboral
        WHERE lab_empresa_id = (SELECT public.get_empresa_id())
          AND lab_fecha_fin IS NULL
          AND lab_sucursal_id = ANY (public.get_sucursal_ids())
      )
    )
  );

COMMIT;
