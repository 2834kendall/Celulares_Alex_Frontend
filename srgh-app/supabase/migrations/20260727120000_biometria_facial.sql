-- Reconocimiento facial del kiosco (SGRH-21): almacenamiento de vectores y
-- auditoria de rechazos.
--
-- Decisiones de diseño (espejo del documento de arquitectura Face ID):
-- * El vector (embedding de MobileFaceNet) se guarda como jsonb de numeros.
--   NO se usa pgvector a proposito: la comparacion (distancia coseno) se hace
--   en TypeScript dentro del Server Action, iterando los arreglos. La base de
--   datos solo persiste y protege los vectores via RLS.
-- * La foto NUNCA llega a la base de datos ni al servidor: el cliente genera
--   el embedding localmente y lo manda cifrado (AES-256-GCM); aqui solo vive
--   el arreglo numerico ya descifrado por el Server Action.
-- * emp_rostro_hash (columna vestigial de sgrh_empleados) se deja intacta:
--   nunca tuvo datos reales y ningun codigo la lee. El vector vive en su
--   propia tabla para poder versionar el modelo y auditar el enrolamiento
--   sin ensanchar sgrh_empleados.
--
-- Toda la migracion es convergente: puede re-ejecutarse sin errores.

-- ─── 1. Vectores faciales por empleado ─────────────────────────────────────
-- Un vector vigente por empleado (UNIQUE): re-enrolar reemplaza, no acumula.
CREATE TABLE IF NOT EXISTS public.sgrh_biometria_empleado (
  bio_id           serial PRIMARY KEY,
  bio_empleado_id  int NOT NULL UNIQUE REFERENCES public.sgrh_empleados(emp_id) ON DELETE CASCADE,
  bio_empresa_id   int NOT NULL REFERENCES public.sgrh_empresas(org_id),
  -- Arreglo de numeros (embedding L2-normalizado). El largo depende del
  -- modelo; se valida en la aplicacion, no aca (mismo criterio que mar_tipo).
  bio_vector       jsonb NOT NULL,
  -- Identifica el modelo que genero el vector: comparar vectores de modelos
  -- distintos no tiene sentido matematico, asi que la app filtra por esto.
  bio_modelo       varchar(50) NOT NULL DEFAULT 'mobilefacenet-v1',
  bio_creado_por   int REFERENCES public.sgrh_usuarios(usr_id),
  bio_created_at   timestamp NOT NULL DEFAULT now(),
  bio_updated_at   timestamp NOT NULL DEFAULT now()
);

ALTER TABLE public.sgrh_biometria_empleado ENABLE ROW LEVEL SECURITY;

-- Lectura: el kiosco (ASISTENCIA_WRITE) necesita bajar los vectores de su
-- empresa para comparar en el Server Action; el gerente (EMPLEADOS_WRITE)
-- los necesita para saber quien esta enrolado.
DROP POLICY IF EXISTS "biometria_select" ON public.sgrh_biometria_empleado;
CREATE POLICY "biometria_select" ON public.sgrh_biometria_empleado
  FOR SELECT TO authenticated
  USING (
    bio_empresa_id = (SELECT public.get_empresa_id())
    AND (
      (SELECT public.tiene_permiso('ASISTENCIA_WRITE'))
      OR (SELECT public.tiene_permiso('EMPLEADOS_WRITE'))
    )
  );

-- Escritura: SOLO el enrolamiento del gerente. El kiosco nunca escribe
-- vectores (solo los lee para comparar).
DROP POLICY IF EXISTS "biometria_insert" ON public.sgrh_biometria_empleado;
CREATE POLICY "biometria_insert" ON public.sgrh_biometria_empleado
  FOR INSERT TO authenticated
  WITH CHECK (
    bio_empresa_id = (SELECT public.get_empresa_id())
    AND (SELECT public.tiene_permiso('EMPLEADOS_WRITE'))
  );

DROP POLICY IF EXISTS "biometria_update" ON public.sgrh_biometria_empleado;
CREATE POLICY "biometria_update" ON public.sgrh_biometria_empleado
  FOR UPDATE TO authenticated
  USING (
    bio_empresa_id = (SELECT public.get_empresa_id())
    AND (SELECT public.tiene_permiso('EMPLEADOS_WRITE'))
  )
  WITH CHECK (
    bio_empresa_id = (SELECT public.get_empresa_id())
    AND (SELECT public.tiene_permiso('EMPLEADOS_WRITE'))
  );

DROP POLICY IF EXISTS "biometria_delete" ON public.sgrh_biometria_empleado;
CREATE POLICY "biometria_delete" ON public.sgrh_biometria_empleado
  FOR DELETE TO authenticated
  USING (
    bio_empresa_id = (SELECT public.get_empresa_id())
    AND (SELECT public.tiene_permiso('EMPLEADOS_WRITE'))
  );

-- ─── 2. Auditoria de rechazos faciales ─────────────────────────────────────
-- Solo se registran los intentos DENIED (distancia > 0.7: persona diferente),
-- que es lo que exige auditoria segun el diseño. bia_mejor_empleado_id es el
-- candidato mas cercano (informativo para el gerente), NO una acusacion.
CREATE TABLE IF NOT EXISTS public.sgrh_biometria_auditoria (
  bia_id                serial PRIMARY KEY,
  bia_empresa_id        int NOT NULL REFERENCES public.sgrh_empresas(org_id),
  bia_sucursal_id       int REFERENCES public.sgrh_sucursales(suc_id),
  bia_resultado         varchar(20) NOT NULL,
  bia_mejor_distancia   numeric(6,4),
  bia_mejor_empleado_id int REFERENCES public.sgrh_empleados(emp_id),
  bia_dispositivo_id    varchar(100),
  bia_created_at        timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_biometria_auditoria_empresa_fecha
  ON public.sgrh_biometria_auditoria (bia_empresa_id, bia_created_at);

ALTER TABLE public.sgrh_biometria_auditoria ENABLE ROW LEVEL SECURITY;

-- Inserta el kiosco (ASISTENCIA_WRITE) cuando verifyFace devuelve DENIED.
DROP POLICY IF EXISTS "biometria_auditoria_insert" ON public.sgrh_biometria_auditoria;
CREATE POLICY "biometria_auditoria_insert" ON public.sgrh_biometria_auditoria
  FOR INSERT TO authenticated
  WITH CHECK (
    bia_empresa_id = (SELECT public.get_empresa_id())
    AND (SELECT public.tiene_permiso('ASISTENCIA_WRITE'))
  );

-- Lee el gerente desde el panel de asistencia. Sin UPDATE/DELETE: un log de
-- auditoria es inmutable por definicion.
DROP POLICY IF EXISTS "biometria_auditoria_select" ON public.sgrh_biometria_auditoria;
CREATE POLICY "biometria_auditoria_select" ON public.sgrh_biometria_auditoria
  FOR SELECT TO authenticated
  USING (
    bia_empresa_id = (SELECT public.get_empresa_id())
    AND (SELECT public.tiene_permiso('ASISTENCIA_READ'))
  );
