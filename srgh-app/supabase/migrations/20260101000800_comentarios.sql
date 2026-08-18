-- =====================================================================
-- SGRH — Baseline: autodocumentación del esquema
-- =====================================================================
-- COMMENT ON de tablas y columnas. Va aparte de las migraciones de tablas a
-- propósito: así el DDL se lee sin ruido y los comentarios se revisan como
-- un bloque.
--
-- Estos comentarios son visibles en el Table Editor de Supabase, en \d+ de
-- psql y en las herramientas de introspección, así que son la documentación
-- que alguien encuentra cuando está mirando la base, no el repo.
--
-- Criterio: se comenta lo que NO se deduce del nombre — unidades, reglas de
-- negocio, denormalizaciones deliberadas, vocabularios que no son enum, y
-- las trampas. No se repite el nombre de la columna en prosa.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- 1. SEGURIDAD: ROLES Y PERMISOS
-- ─────────────────────────────────────────────────────────────────────

COMMENT ON TABLE public.sgrh_cat_roles IS
  'Roles del sistema. Un usuario tiene UN rol por empresa (vía sgrh_usuarios_empresa_rol). El modelo de producción son cuatro: ADMIN (toda su empresa), GERENTE (una sucursal), EMPLEADO (solo lo suyo) y KIOSCO (solo marcar). El resto existe definido pero inactivo.';
COMMENT ON COLUMN public.sgrh_cat_roles.rol_codigo IS
  'Identificador estable usado por el código y por get_rol(). Nunca se renombra: cambiarlo rompe el JWT de las sesiones vivas.';
COMMENT ON COLUMN public.sgrh_cat_roles.rol_activo IS
  'false = definido pero no asignable desde la UI. NO bloquea el login de quien ya lo tenga: para eso está uer_activo.';

COMMENT ON TABLE public.sgrh_cat_permisos IS
  'Catálogo de permisos. Los códigos deben coincidir exactamente con la constante PERMISOS de src/lib/permissions/catalog.ts — hay un test que lo verifica.';
COMMENT ON COLUMN public.sgrh_cat_permisos.per_codigo IS
  'Convención <MODULO>_<ACCION>. Es lo que consulta tiene_permiso() y lo que viaja en el claim `permisos` del JWT.';
COMMENT ON COLUMN public.sgrh_cat_permisos.per_modulo IS
  'Agrupador para la UI de administración de roles. No tiene efecto en la autorización.';

COMMENT ON TABLE public.sgrh_rol_permisos IS
  'Matriz rol → permiso. La lee custom_access_token_hook en cada login para armar el claim `permisos`. Cambiar una fila acá no afecta a las sesiones ya emitidas: el JWT se refresca al renovar el token.';

-- ─────────────────────────────────────────────────────────────────────
-- 2. TERRITORIO (IGN Costa Rica)
-- ─────────────────────────────────────────────────────────────────────

COMMENT ON TABLE public.sgrh_cat_provincias IS
  'División territorial de Costa Rica, nivel 1. Catálogo global (sin dueño), 7 filas fijas del IGN.';
COMMENT ON TABLE public.sgrh_cat_cantones IS
  'División territorial nivel 2. 84 filas fijas del IGN.';
COMMENT ON TABLE public.sgrh_cat_distritos IS
  'División territorial nivel 3. 492 filas fijas del IGN.';
COMMENT ON COLUMN public.sgrh_cat_provincias.prv_codigo IS
  'Código oficial IGN de 1 dígito. Las referencias entre niveles se resuelven por código, no por id.';
COMMENT ON COLUMN public.sgrh_cat_cantones.can_codigo IS
  'Código oficial IGN de 3 dígitos (PCC): provincia + cantón.';
COMMENT ON COLUMN public.sgrh_cat_distritos.dis_codigo IS
  'Código oficial IGN de 5 dígitos (PCCDD). ES el código postal de Costa Rica, por eso el catálogo no lleva una columna aparte para él.';

-- ─────────────────────────────────────────────────────────────────────
-- 3. CATÁLOGOS LABORALES
-- ─────────────────────────────────────────────────────────────────────

COMMENT ON TABLE public.sgrh_cat_tipos_identificacion IS
  'Documentos de identidad válidos en CR (cédula, DIMEX, pasaporte, etc.). Catálogo global.';

COMMENT ON TABLE public.sgrh_cat_tipos_jornada IS
  'Jornadas del Código de Trabajo (arts. 135-140). Los topes y recargos son legales, no configurables por gusto.';
COMMENT ON COLUMN public.sgrh_cat_tipos_jornada.tjo_horas_max_diarias IS
  'Tope legal de horas ordinarias por día. Lo que exceda es jornada extraordinaria.';
COMMENT ON COLUMN public.sgrh_cat_tipos_jornada.tjo_horas_max_semanales IS
  'Tope legal de horas ordinarias por semana.';
COMMENT ON COLUMN public.sgrh_cat_tipos_jornada.tjo_recargo_porcentaje IS
  'Recargo sobre la hora ordinaria, en porcentaje (50 = +50%). 0 para la jornada diurna.';

COMMENT ON TABLE public.sgrh_cat_tipos_contrato IS
  'Modalidades de contratación. tco_permite_* alimenta el cálculo de liquidaciones.';
COMMENT ON COLUMN public.sgrh_cat_tipos_contrato.tco_permite_preaviso IS
  'Si este tipo de contrato genera preaviso al terminar. Un plazo fijo que vence no lo genera.';
COMMENT ON COLUMN public.sgrh_cat_tipos_contrato.tco_permite_cesantia IS
  'Si este tipo de contrato genera cesantía al terminar.';

COMMENT ON TABLE public.sgrh_cat_motivos_salida IS
  'Causales de fin de relación laboral, con su efecto legal sobre preaviso y cesantía.';
COMMENT ON COLUMN public.sgrh_cat_motivos_salida.mot_genera_preaviso IS
  'Si la causal obliga a pagar preaviso. Combinado con tco_permite_preaviso decide el rubro en la liquidación.';
COMMENT ON COLUMN public.sgrh_cat_motivos_salida.mot_genera_cesantia IS
  'Si la causal obliga a pagar cesantía.';
COMMENT ON COLUMN public.sgrh_cat_motivos_salida.mot_nota_legal IS
  'Artículo del Código de Trabajo que respalda la causal. Se muestra en la UI al liquidar.';

COMMENT ON TABLE public.sgrh_cat_tipos_ausencia IS
  'Tipos de ausencia con su tratamiento legal: cuántos días paga el patrono, desde cuándo entra el subsidio de CCSS/INS y en qué porcentaje.';
COMMENT ON COLUMN public.sgrh_cat_tipos_ausencia.tau_requiere_documento_ccss IS
  'Si exige boleta de incapacidad. La UI pide aus_numero_boleta_ccss cuando es true.';
COMMENT ON COLUMN public.sgrh_cat_tipos_ausencia.tau_paga_empleador_dias IS
  'Cuántos días paga el patrono antes de que entre el subsidio. 0 = desde el día uno lo cubre la institución (o nadie).';
COMMENT ON COLUMN public.sgrh_cat_tipos_ausencia.tau_porcentaje_pago_empleador IS
  'Porcentaje del salario que paga el patrono durante esos días (100 = salario completo).';
COMMENT ON COLUMN public.sgrh_cat_tipos_ausencia.tau_paga_ccss_desde_dia IS
  'Día a partir del cual subsidia la institución. NULL = no hay subsidio (permisos, vacaciones).';
COMMENT ON COLUMN public.sgrh_cat_tipos_ausencia.tau_porcentaje_subsidio_ccss IS
  'Porcentaje que cubre la institución. NULL cuando no hay subsidio.';
COMMENT ON COLUMN public.sgrh_cat_tipos_ausencia.tau_descuenta_vacaciones IS
  'Si los días consumen el saldo de vacaciones del empleado.';
COMMENT ON COLUMN public.sgrh_cat_tipos_ausencia.tau_es_protegida IS
  'Ausencia con fuero legal (maternidad, paternidad, riesgo de trabajo, sindical, huelga): no puede motivar un despido.';
COMMENT ON COLUMN public.sgrh_cat_tipos_ausencia.tau_es_intradia IS
  'true = se mide en horas dentro de un mismo día (lactancia), no en días completos. Cambia el cálculo y la UI.';

COMMENT ON TABLE public.sgrh_cat_bancos IS
  'Entidades financieras de CR. Catálogo global compartido entre empresas.';
COMMENT ON COLUMN public.sgrh_cat_bancos.ban_codigo IS
  'Código de entidad del BCCR: los 3 dígitos que viajan dentro del IBAN CR en las posiciones 6-8. La RPC de onboarding lo usa para verificar que el IBAN corresponde al banco elegido. NULL si se desconoce.';

COMMENT ON TABLE public.sgrh_cat_conceptos_nomina IS
  'Conceptos de planilla (ingresos, deducciones y cargas patronales). con_tipo_calculo describe CÓMO se calcula cada uno, para que el motor de nómina no tenga que deducirlo del código.';
COMMENT ON COLUMN public.sgrh_cat_conceptos_nomina.con_tipo IS
  'ingreso | deduccion | patronal. Vocabulario sin CHECK: se valida en la aplicación.';
COMMENT ON COLUMN public.sgrh_cat_conceptos_nomina.con_afecta_salario_bruto IS
  'Si suma al bruto que se reporta. Viáticos y aguinaldo no lo afectan.';
COMMENT ON COLUMN public.sgrh_cat_conceptos_nomina.con_afecta_base_ccss IS
  'Si entra en la base sobre la que se calculan las cargas sociales.';
COMMENT ON COLUMN public.sgrh_cat_conceptos_nomina.con_formula_base IS
  'Etiqueta libre de la serie original de diseño. Informativa: el cálculo real lo decide con_tipo_calculo.';
COMMENT ON COLUMN public.sgrh_cat_conceptos_nomina.con_tipo_calculo IS
  'monto_manual_ingreso | monto_manual_deduccion | porcentaje_deduccion_bruto | horas_extra_automatico. Los dos últimos exigen con_porcentaje (hay un CHECK).';
COMMENT ON COLUMN public.sgrh_cat_conceptos_nomina.con_porcentaje IS
  'Porcentaje aplicable. Obligatorio para los tipos que lo usan y NULL para los montos manuales; el CHECK lo impone.';
COMMENT ON COLUMN public.sgrh_cat_conceptos_nomina.con_activo IS
  'false lo saca de la UI pero conserva el histórico. HORAS_EXTRA está inactivo a propósito: lo reemplazó el banco de horas, pero la fila debe existir porque pagarBancoHoras lo busca por código.';

COMMENT ON TABLE public.sgrh_cat_areas_evaluacion IS
  'Áreas de una evaluación de desempeño. Catálogo global.';
COMMENT ON COLUMN public.sgrh_cat_areas_evaluacion.are_tipo_aplicacion IS
  'operativo | administrativo | ambos. Filtra qué áreas se ofrecen según el puesto evaluado.';
COMMENT ON TABLE public.sgrh_cat_criterios_evaluacion IS
  'Criterios concretos que se puntúan, agrupados por área.';

COMMENT ON TABLE public.sgrh_cat_etapas_seleccion IS
  'Embudo de reclutamiento. Ninguna vacante pasa por todas: la postulación registra solo las etapas que recorre.';
COMMENT ON COLUMN public.sgrh_cat_etapas_seleccion.eta_orden IS
  'Posición en el embudo. Ordena la UI; no impide saltarse etapas.';

COMMENT ON TABLE public.sgrh_cat_tipos_documento IS
  'Tipos de documento del expediente. Catálogo global sin UI de administración: agregar un tipo es una fila más en el seed.';

-- ─────────────────────────────────────────────────────────────────────
-- 4. ENTIDADES CORE
-- ─────────────────────────────────────────────────────────────────────

COMMENT ON TABLE public.sgrh_direcciones IS
  'Dirección postal normalizada. Empleados, empresas y sucursales la referencian en vez de guardar distrito + señas inline.';
COMMENT ON COLUMN public.sgrh_direcciones.dir_codigo_postal IS
  'Redundante con dis_codigo por diseño: se materializa para reportes sin obligar al join de tres niveles. Lo escribe SIEMPRE el trigger trg_direcciones_codigo_postal; el valor que mande el cliente se ignora.';
COMMENT ON COLUMN public.sgrh_direcciones.dir_senas_exactas IS
  'Texto libre con el detalle que no cabe en la división territorial (referencias, distancias).';

COMMENT ON TABLE public.sgrh_empresas IS
  'Inquilino del sistema. TODO el aislamiento multi-empresa cuelga de org_id vía el claim empresa_id del JWT.';
COMMENT ON COLUMN public.sgrh_empresas.org_cedula_juridica IS
  'Cédula jurídica de Hacienda. Es la clave natural de la empresa y por eso es UNIQUE.';
COMMENT ON COLUMN public.sgrh_empresas.org_actividad_economica_ciiu IS
  'Actividad económica declarada. Hoy texto libre; si se necesita el código CIIU formal, va catálogo.';
COMMENT ON COLUMN public.sgrh_empresas.org_periodicidad_pago IS
  'Quincenal | Mensual. Define cuántos periodos de planilla se generan por mes.';
COMMENT ON COLUMN public.sgrh_empresas.org_dia_pago_1 IS
  'Día del mes del primer pago. Con periodicidad quincenal se usa junto a org_dia_pago_2.';
COMMENT ON COLUMN public.sgrh_empresas.org_dia_pago_2 IS
  'Día del segundo pago. NULL si la periodicidad es mensual.';
COMMENT ON COLUMN public.sgrh_empresas.org_activa IS
  'false = empresa dada de baja. No se borra: hay planillas e historial laboral colgando.';

COMMENT ON TABLE public.sgrh_sucursales IS
  'Punto de operación de una empresa. Es la unidad de scoping del rol GERENTE y la que ancla las marcas de asistencia.';
COMMENT ON COLUMN public.sgrh_sucursales.suc_latitud IS
  'Centro de la geocerca. Se compara contra la posición del dispositivo al marcar asistencia.';
COMMENT ON COLUMN public.sgrh_sucursales.suc_longitud IS
  'Centro de la geocerca (ver suc_latitud).';
COMMENT ON COLUMN public.sgrh_sucursales.suc_radio_geocerca_metros IS
  'Radio en metros dentro del cual se acepta una marca. Un radio chico exige buen GPS; 20-50 m es lo usual.';
COMMENT ON COLUMN public.sgrh_sucursales.suc_tolerancia_tardia_minutos IS
  'Minutos de gracia antes de contar una entrada como tardía. Se evalúa al calcular, no al marcar: cambiarlo recalcula el pasado.';

COMMENT ON TABLE public.sgrh_cat_puestos IS
  'Puestos de trabajo. Catálogo POR EMPRESA: cada una define los suyos, así que toda validación cruzada debe comparar contra el empresa_id del JWT.';
COMMENT ON COLUMN public.sgrh_cat_puestos.pue_salario_minimo_referencia IS
  'Salario mínimo de ley para el puesto. Referencia para la UI al contratar; no se impone.';

COMMENT ON TABLE public.sgrh_cat_horarios IS
  'Plantillas de horario por empresa. La programación semanal las referencia y puede sobreescribirlas día a día con sus columnas *_custom.';
COMMENT ON COLUMN public.sgrh_cat_horarios.hor_duracion_almuerzo_min IS
  'Minutos de almuerzo. Redundante con la diferencia entre inicio y fin: manda esta columna cuando el almuerzo es flexible.';
COMMENT ON COLUMN public.sgrh_cat_horarios.hor_duracion_break_min IS
  'Minutos de break (mismo criterio que hor_duracion_almuerzo_min).';

COMMENT ON TABLE public.sgrh_cat_niveles_comision IS
  'Escalones de comisión por venta, por empresa. El nivel aplicable sale de comparar la venta contra nvc_meta_minima/maxima.';
COMMENT ON COLUMN public.sgrh_cat_niveles_comision.nvc_meta_maxima IS
  'Techo del escalón. NULL = sin techo (último tramo).';
COMMENT ON COLUMN public.sgrh_cat_niveles_comision.nvc_porcentaje IS
  'Porcentaje de comisión del escalón.';

COMMENT ON TABLE public.sgrh_cat_feriados IS
  'Feriados. fer_empresa_id NULL = feriado nacional aplicable a todas; con valor = asueto propio de esa empresa.';
COMMENT ON COLUMN public.sgrh_cat_feriados.fer_es_pago_obligatorio IS
  'Si la ley obliga a pagarlo aunque no se trabaje.';

COMMENT ON TABLE public.sgrh_empleados IS
  'Datos personales del empleado. NO tiene columna de empresa a propósito: la pertenencia se resuelve SIEMPRE vía sgrh_historial_laboral, porque una persona puede haber pasado por varias empresas del grupo.';
COMMENT ON COLUMN public.sgrh_empleados.emp_numero_identificacion IS
  'Número del documento. UNIQUE global (no por empresa): la misma persona no se duplica entre empresas del grupo.';
COMMENT ON COLUMN public.sgrh_empleados.emp_nacionalidad IS
  'Texto libre. Relevante para el tipo de documento y para reportes de planilla.';
COMMENT ON COLUMN public.sgrh_empleados.emp_fecha_ingreso_original IS
  'Primer ingreso de la persona a la organización, aunque haya salido y vuelto. Base de la antigüedad; NO se recalcula al recontratar. La fecha de cada contrato vive en lab_fecha_inicio.';
COMMENT ON COLUMN public.sgrh_empleados.emp_numero_asegurado_ccss IS
  'Número de asegurado de la CCSS. UNIQUE porque identifica a la persona ante la institución.';
COMMENT ON COLUMN public.sgrh_empleados.emp_rostro_hash IS
  'Remanente del primer diseño de reconocimiento facial. La biometría real vive en sgrh_biometria_empleado; esta columna ya no se escribe.';
COMMENT ON COLUMN public.sgrh_empleados.emp_foto_path IS
  'Ruta del objeto en el bucket privado fotos-empleados. NUNCA una URL firmada: las firmas expiran y se generan on-demand en el servidor.';
COMMENT ON COLUMN public.sgrh_empleados.emp_direccion_id IS
  'NOT NULL: el alta exige dirección. Por eso crear_empleado_completo inserta la dirección ANTES que el empleado.';

COMMENT ON TABLE public.sgrh_usuarios IS
  'Cuenta de acceso, espejo de auth.users. Un empleado puede no tener cuenta, y una cuenta puede existir sin empleado vinculado todavía.';
COMMENT ON COLUMN public.sgrh_usuarios.usr_auth_id IS
  'FK a auth.users. Es lo que enlaza esta fila con la sesión de Supabase Auth; custom_access_token_hook busca por acá.';
COMMENT ON COLUMN public.sgrh_usuarios.usr_password_hash IS
  'Remanente del diseño previo a Supabase Auth. La contraseña real la administra Auth: esta columna no autentica nada.';
COMMENT ON COLUMN public.sgrh_usuarios.usr_activo IS
  'Baja lógica. Desactivar también banea en Supabase Auth; nunca se borra la fila porque hay auditoría colgando.';
COMMENT ON COLUMN public.sgrh_usuarios.usr_ultimo_acceso IS
  'NO lo actualiza nadie hoy. Para el último acceso real hay que mirar last_sign_in_at de la API de Auth.';

COMMENT ON TABLE public.sgrh_usuarios_empresa_rol IS
  'Quién es quién: una fila = un rol efectivo en una empresa (y opcionalmente en una sucursal). Es LA superficie de escalada de privilegios del sistema; sus cuatro policies exigen uer_empresa_id = get_empresa_id() sin excepción.';
COMMENT ON COLUMN public.sgrh_usuarios_empresa_rol.uer_sucursal_id IS
  'NULL = opera a nivel empresa (ADMIN). Con valor = adscrito a esa sucursal (GERENTE, KIOSCO). Viaja al JWT como el claim sucursal_id y es lo que lee public.sucursal_visible().';
COMMENT ON COLUMN public.sgrh_usuarios_empresa_rol.uer_activo IS
  'false = vínculo revocado. custom_access_token_hook solo considera filas activas, así que desactivar deja al usuario sin rol ni permisos en el siguiente token.';

COMMENT ON TABLE public.sgrh_historial_laboral IS
  'La tabla pivote del sistema: ata empleado con empresa, sucursal y puesto, y por ella pasa casi toda la RLS multi-empresa. Una fila por asignación; un traslado o cambio de contrato CIERRA la vigente (lab_fecha_fin) y abre una nueva — nunca se edita lab_sucursal_id en sitio, porque eso reescribiría la historia.';
COMMENT ON COLUMN public.sgrh_historial_laboral.lab_fecha_fin IS
  'NULL = asignación vigente. Las consultas operativas filtran por IS NULL para tomar el contrato activo.';
COMMENT ON COLUMN public.sgrh_historial_laboral.lab_salario_base IS
  'Salario de contrato. Base de las cargas sociales y de la liquidación. Escribirlo exige HISTORIAL_WRITE.';
COMMENT ON COLUMN public.sgrh_historial_laboral.lab_salario_real IS
  'Salario efectivamente pactado cuando difiere del base (p. ej. mínimo garantizado sobre comisiones).';
COMMENT ON COLUMN public.sgrh_historial_laboral.lab_recontratable IS
  'Marca de RRHH para futuras contrataciones. No lo evalúa ninguna lógica: es informativo.';

COMMENT ON TABLE public.sgrh_empleado_datos_pago IS
  'Datos bancarios del empleado, 1:1. Se separaron de sgrh_empleados para validarlos contra el catálogo de bancos y para poder restringirlos aparte.';
COMMENT ON COLUMN public.sgrh_empleado_datos_pago.edp_tipo_cuenta IS
  'CORRIENTE | AHORRO | SINPE. Decide cómo se valida edp_numero_cuenta.';
COMMENT ON COLUMN public.sgrh_empleado_datos_pago.edp_numero_cuenta IS
  'IBAN (CR + 20 dígitos) o teléfono de 8 dígitos si el tipo es SINPE. Se normaliza a mayúsculas y sin espacios; para IBAN se verifica que las posiciones 6-8 coincidan con ban_codigo.';

-- ─────────────────────────────────────────────────────────────────────
-- 5. ASISTENCIA Y AUSENCIAS
-- ─────────────────────────────────────────────────────────────────────

COMMENT ON TABLE public.sgrh_marcas_asistencia IS
  'Marcas de entrada, salida y descansos. mar_sucursal_id se fija al marcar y NO cambia si el empleado se traslada: el registro pertenece a la sucursal donde ocurrió, y de eso depende que el gerente anterior conserve su histórico.';
COMMENT ON COLUMN public.sgrh_marcas_asistencia.mar_tipo IS
  'Vocabulario de la aplicación (entrada, salida, inicio/fin de almuerzo o break). Deliberadamente SIN CHECK para poder evolucionarlo sin migración; se valida con Zod.';
COMMENT ON COLUMN public.sgrh_marcas_asistencia.mar_metodo_verificacion IS
  'FACIAL solo si el servidor validó un ticket HMAC emitido por verifyFace para ESE empleado. La palabra del cliente no basta, así que cualquier otro caso se degrada a MANUAL sin rechazar la marca.';
COMMENT ON COLUMN public.sgrh_marcas_asistencia.mar_distancia_geocerca_metros IS
  'Distancia al centro de la sucursal al momento de marcar. Se guarda aunque exceda el radio: la marca se registra igual y queda la evidencia.';
COMMENT ON COLUMN public.sgrh_marcas_asistencia.mar_dispositivo_id IS
  'Identificador del dispositivo que originó la marca. Sirve para rastrear un kiosco concreto.';
COMMENT ON COLUMN public.sgrh_marcas_asistencia.mar_registrado_por_id IS
  'Usuario que registró la marca cuando no fue el propio empleado (kiosco o supervisor). NULL en autoservicio.';

COMMENT ON TABLE public.sgrh_programacion_semanal IS
  'Horario planificado por empleado y día. Las columnas *_custom sobreescriben puntualmente el horario del catálogo sin crear una plantilla nueva.';
COMMENT ON COLUMN public.sgrh_programacion_semanal.prg_horario_id IS
  'Plantilla base del día. NULL cuando el día se define enteramente con las columnas *_custom o es libre.';
COMMENT ON COLUMN public.sgrh_programacion_semanal.prg_hora_entrada_custom IS
  'Sobreescribe la hora de entrada del horario base solo para este día. NULL = se usa la de la plantilla.';
COMMENT ON COLUMN public.sgrh_programacion_semanal.prg_es_apertura IS
  'Marca al responsable de abrir el local ese día. Informativo para la operación.';
COMMENT ON COLUMN public.sgrh_programacion_semanal.prg_es_cierre IS
  'Marca al responsable de cerrar el local ese día.';
COMMENT ON COLUMN public.sgrh_programacion_semanal.prg_es_feriado IS
  'Marca el día como feriado para el cálculo de planilla. Se llena desde sgrh_cat_feriados al programar.';

COMMENT ON TABLE public.sgrh_ausencias IS
  'Solicitudes de ausencia y su resolución. El empleado crea la suya sin permiso alguno (la policy lo permite por autoservicio); aprobarla exige AUSENCIAS_APPROVE.';
COMMENT ON COLUMN public.sgrh_ausencias.aus_estado IS
  'pendiente | aprobada | rechazada. Vocabulario de la aplicación, sin CHECK.';
COMMENT ON COLUMN public.sgrh_ausencias.aus_dias_habiles IS
  'Días hábiles que abarca, ya descontados fines de semana y feriados. Es el número que usa la planilla.';
COMMENT ON COLUMN public.sgrh_ausencias.aus_dias_naturales IS
  'Días corridos entre inicio y fin. Para incapacidades, que se cuentan naturales.';
COMMENT ON COLUMN public.sgrh_ausencias.aus_numero_boleta_ccss IS
  'Boleta de incapacidad. Obligatoria cuando el tipo tiene tau_requiere_documento_ccss.';
COMMENT ON COLUMN public.sgrh_ausencias.aus_dias_paga_empleador IS
  'Días de esta ausencia a cargo del patrono, ya resueltos según las reglas del tipo. Se congela al aprobar para que un cambio de catálogo no altere planillas cerradas.';
COMMENT ON COLUMN public.sgrh_ausencias.aus_dias_paga_ccss IS
  'Días subsidiados por la institución (ver aus_dias_paga_empleador).';
COMMENT ON COLUMN public.sgrh_ausencias.aus_dias_sin_goce IS
  'Días que no paga nadie y se descuentan del salario.';

-- ─────────────────────────────────────────────────────────────────────
-- 6. NÓMINA
-- ─────────────────────────────────────────────────────────────────────

COMMENT ON TABLE public.sgrh_nomina_periodo IS
  'Periodo de planilla de una sucursal. El índice único (sucursal, año, mes, quincena) impide crear dos veces el mismo.';
COMMENT ON COLUMN public.sgrh_nomina_periodo.npe_estado IS
  'borrador | pagado. Solo esos dos valores están en uso, y la aplicación los recalcula sola: pasa a pagado cuando TODOS los empleados del periodo quedan pagados y vuelve a borrador si se desmarca alguno.';
COMMENT ON COLUMN public.sgrh_nomina_periodo.npe_quincena IS
  '1 o 2 dentro del mes. Con periodicidad mensual siempre es 1.';
COMMENT ON COLUMN public.sgrh_nomina_periodo.npe_aprobado_por_id IS
  'Remanente del flujo de aprobación explícita, que se retiró al pasar a dos estados. Puede quedar NULL.';

COMMENT ON TABLE public.sgrh_nomina_detalle IS
  'Una fila por empleado dentro de un periodo: el encabezado de su liquidación quincenal. Los montos concretos viven en las tres tablas de línea.';
COMMENT ON COLUMN public.sgrh_nomina_detalle.ndt_horas_ordinarias_diurnas IS
  'Horas trabajadas en la quincena. Es la entrada del cálculo de horas extra automáticas.';
COMMENT ON COLUMN public.sgrh_nomina_detalle.ndt_salario_por_hora IS
  'Salario por hora congelado para ESTE periodo. Se guarda aparte para que un aumento posterior no reescriba el monto de horas extra ya calculado.';
COMMENT ON COLUMN public.sgrh_nomina_detalle.ndt_salario_bruto IS
  'Total de ingresos antes de deducciones. Lo calcula la aplicación sumando las líneas de ingreso.';
COMMENT ON COLUMN public.sgrh_nomina_detalle.ndt_total_cargas_patronales IS
  'Costo del patrono sobre este empleado. NO se descuenta del neto: es información de costo.';
COMMENT ON COLUMN public.sgrh_nomina_detalle.ndt_salario_neto IS
  'Lo que efectivamente recibe el empleado: bruto menos deducciones obreras.';
COMMENT ON COLUMN public.sgrh_nomina_detalle.ndt_pagado IS
  'Marca individual de pago. Al marcarlas todas, el periodo pasa a pagado automáticamente.';
COMMENT ON COLUMN public.sgrh_nomina_detalle.ndt_fecha_registro IS
  'Fecha en que se generó la fila, no la del pago. La del pago es ndt_fecha_pago.';

COMMENT ON TABLE public.sgrh_nomina_linea_ingreso IS
  'Ingresos del empleado en el periodo, un concepto por fila.';
COMMENT ON COLUMN public.sgrh_nomina_linea_ingreso.ing_cantidad IS
  'Unidades del concepto (horas, días). NULL cuando el monto se captura directo.';
COMMENT ON COLUMN public.sgrh_nomina_linea_ingreso.ing_tarifa_unitaria IS
  'Valor unitario aplicado. Junto a ing_cantidad explica cómo se llegó a ing_monto.';

COMMENT ON TABLE public.sgrh_nomina_linea_deduccion IS
  'Deducciones del periodo: CCSS obrera, renta, embargos, préstamos.';
COMMENT ON COLUMN public.sgrh_nomina_linea_deduccion.ded_base_calculo IS
  'Monto sobre el que se aplicó el porcentaje. Se guarda para poder auditar el cálculo sin recomputarlo.';
COMMENT ON COLUMN public.sgrh_nomina_linea_deduccion.ded_es_voluntaria IS
  'true para deducciones que el empleado autorizó (asociación solidarista, préstamo); false para las de ley.';
COMMENT ON COLUMN public.sgrh_nomina_linea_deduccion.ded_beneficio_id IS
  'Enlaza la cuota con el beneficio que la origina, para ir amortizando ben_monto_deducido.';

COMMENT ON TABLE public.sgrh_nomina_linea_patronal IS
  'Cargas sociales a cargo del patrono. No afectan el neto del empleado: son costo de la empresa.';

COMMENT ON TABLE public.sgrh_comprobantes_pago IS
  'Comprobante entregable al empleado por cada liquidación quincenal.';
COMMENT ON COLUMN public.sgrh_comprobantes_pago.com_codigo_verificacion IS
  'Código único con el que el empleado consulta su comprobante sin iniciar sesión. Es el secreto de esa URL pública, así que no debe ser predecible.';
COMMENT ON COLUMN public.sgrh_comprobantes_pago.com_confirmado_por_empleado IS
  'Acuse de recibo del empleado. Sirve como respaldo de entrega.';

COMMENT ON TABLE public.sgrh_banco_horas_movimientos IS
  'Horas trabajadas por encima del tope quincenal. Quedan PENDIENTES en vez de pagarse solas: el encargado de nómina decide si pagarlas o compensarlas con tiempo libre.';
COMMENT ON COLUMN public.sgrh_banco_horas_movimientos.bhm_nomina_detalle_id IS
  'Periodo donde se generaron las horas. UNIQUE: un mismo detalle no puede generar dos movimientos.';
COMMENT ON COLUMN public.sgrh_banco_horas_movimientos.bhm_salario_por_hora IS
  'Salario por hora de ese periodo, congelado, para que el monto sugerido no cambie si el salario se actualiza después.';
COMMENT ON COLUMN public.sgrh_banco_horas_movimientos.bhm_estado IS
  'pendiente | pagado | compensado. Compensado no genera monto: solo deja constancia de que se resolvió.';
COMMENT ON COLUMN public.sgrh_banco_horas_movimientos.bhm_nomina_detalle_pago_id IS
  'Periodo donde se aplicó el pago. Solo tiene valor cuando bhm_estado = pagado, y puede ser distinto del periodo que generó las horas.';

COMMENT ON TABLE public.sgrh_liquidaciones IS
  'Finiquitos. Una por asignación laboral (liq_historial_laboral_id es UNIQUE): no se puede liquidar dos veces el mismo contrato. Guarda el desglose completo para poder auditar el cálculo años después.';
COMMENT ON COLUMN public.sgrh_liquidaciones.liq_salario_diario IS
  'Salario diario usado como base de todos los rubros, congelado al liquidar.';
COMMENT ON COLUMN public.sgrh_liquidaciones.liq_aguinaldo_proporcional IS
  'Aguinaldo acumulado y no pagado a la fecha de salida.';
COMMENT ON COLUMN public.sgrh_liquidaciones.liq_dias_preaviso IS
  'Días de preaviso que corresponden según antigüedad y causal. 0 si la causal no lo genera.';
COMMENT ON COLUMN public.sgrh_liquidaciones.liq_dias_cesantia IS
  'Días de cesantía según antigüedad y causal, con el tope legal de 8 años.';

COMMENT ON TABLE public.sgrh_comisiones_calculadas IS
  'Comisión de un empleado en un periodo, ya resuelta contra el escalón que le tocó.';
COMMENT ON COLUMN public.sgrh_comisiones_calculadas.cal_nomina_detalle_id IS
  'Periodo de planilla donde se pagó. NULL mientras la comisión está calculada pero aún no liquidada.';

COMMENT ON TABLE public.sgrh_provisiones_anuales IS
  'Acumulados anuales por empleado: aguinaldo, cesantía y saldo de vacaciones. Es el estado que consume la liquidación.';
COMMENT ON COLUMN public.sgrh_provisiones_anuales.pra_dias_vacaciones_disponibles IS
  'Columna con DEFAULT calculado (ganados − usados). No es GENERATED: si se actualizan los otros dos hay que recalcularla.';
COMMENT ON COLUMN public.sgrh_provisiones_anuales.pra_anios_servicio_al_cierre IS
  'Antigüedad al cierre del año, con decimales. Determina el tope de cesantía.';

COMMENT ON TABLE public.sgrh_beneficios_empleado IS
  'Beneficios o adelantos con cuotas que se van descontando de la planilla (préstamos, adelantos de salario).';
COMMENT ON COLUMN public.sgrh_beneficios_empleado.ben_monto_deducido IS
  'Acumulado ya descontado. Cuando alcanza a ben_monto_total el beneficio se da por saldado.';
COMMENT ON COLUMN public.sgrh_beneficios_empleado.ben_cuota_mensual IS
  'Monto sugerido por periodo. La deducción real se registra en sgrh_nomina_linea_deduccion.';

-- ─────────────────────────────────────────────────────────────────────
-- 7. RECLUTAMIENTO, EVALUACIONES, NOTIFICACIONES
-- ─────────────────────────────────────────────────────────────────────

COMMENT ON TABLE public.sgrh_candidatos IS
  'Personas que postulan. NO tienen empresa: un candidato puede postular a varias, y el vínculo con la empresa nace en sgrh_postulaciones.';
COMMENT ON COLUMN public.sgrh_candidatos.cdt_fuente_reclutamiento IS
  'De dónde vino el candidato (referido, portal, redes). Para medir qué canal funciona.';

COMMENT ON TABLE public.sgrh_postulaciones IS
  'Candidato aplicando a un puesto de una empresa. Acá sí hay empresa: es donde el candidato entra al ámbito del inquilino.';
COMMENT ON COLUMN public.sgrh_postulaciones.pos_estado_final IS
  'en_proceso | contratado | descartado. Vocabulario de la aplicación.';

COMMENT ON TABLE public.sgrh_postulacion_etapas IS
  'Paso de una postulación por una etapa del embudo, con su resultado.';
COMMENT ON COLUMN public.sgrh_postulacion_etapas.pet_resultado IS
  'Resultado de la etapa (aprobado, rechazado, pendiente). Texto libre validado en la aplicación.';

COMMENT ON TABLE public.sgrh_evaluaciones IS
  'Encabezado de una evaluación de desempeño. eve_historial_laboral_id NULL permite evaluar a nivel de sucursal en vez de a una persona.';
COMMENT ON COLUMN public.sgrh_evaluaciones.eve_tipo_evaluacion IS
  'Distingue evaluación individual de evaluación de sucursal o equipo.';
COMMENT ON COLUMN public.sgrh_evaluaciones.eve_tipo_periodo IS
  'Periodicidad que cubre (mensual, trimestral, anual, periodo de prueba).';
COMMENT ON COLUMN public.sgrh_evaluaciones.eve_estado IS
  'borrador | finalizada. En borrador se puede editar; finalizada congela los puntajes.';
COMMENT ON COLUMN public.sgrh_evaluaciones.eve_promedio_final IS
  'Promedio de los criterios puntuados, excluyendo los marcados como no aplica.';

COMMENT ON TABLE public.sgrh_evaluacion_resultados IS
  'Puntaje de cada criterio dentro de una evaluación.';
COMMENT ON COLUMN public.sgrh_evaluacion_resultados.evr_no_aplica IS
  'true = el criterio no corresponde al puesto y NO entra en el promedio. Distinto de puntaje 0, que sí penaliza.';

COMMENT ON TABLE public.sgrh_notificaciones IS
  'Avisos al usuario o al empleado. Módulo no implementado todavía: la tabla existe y nadie la escribe.';
COMMENT ON COLUMN public.sgrh_notificaciones.ntf_canal IS
  'Medio de entrega (in_app, email). Determina quién la consume.';
COMMENT ON COLUMN public.sgrh_notificaciones.ntf_estado IS
  'pendiente | enviada | fallida. Distinto de ntf_leida, que es del lado del destinatario.';
COMMENT ON COLUMN public.sgrh_notificaciones.ntf_intentos IS
  'Reintentos de envío. Para no reintentar indefinidamente un destinatario inválido.';

-- ─────────────────────────────────────────────────────────────────────
-- 8. BIOMETRÍA Y DOCUMENTOS
-- ─────────────────────────────────────────────────────────────────────

COMMENT ON TABLE public.sgrh_biometria_empleado IS
  'Vector facial del empleado para el reconocimiento del kiosco. El dato más sensible del esquema: su policy de lectura además acota por sucursal, para que un kiosco no pueda descargarse la biometría de toda la empresa.';
COMMENT ON COLUMN public.sgrh_biometria_empleado.bio_empresa_id IS
  'Denormalizado a propósito: sgrh_empleados no tiene columna de empresa y la RLS del kiosco necesita filtrar sin pasar por historial.';
COMMENT ON COLUMN public.sgrh_biometria_empleado.bio_vector IS
  'Embedding L2-normalizado. El largo depende del modelo y se valida en la aplicación, no acá.';
COMMENT ON COLUMN public.sgrh_biometria_empleado.bio_modelo IS
  'Modelo que generó el vector. Comparar vectores de modelos distintos no tiene sentido matemático, así que la aplicación filtra por esto.';

COMMENT ON TABLE public.sgrh_biometria_auditoria IS
  'Bitácora de intentos de reconocimiento RECHAZADOS. Solo se registran los DENIED: los aciertos ya quedan como marca de asistencia.';
COMMENT ON COLUMN public.sgrh_biometria_auditoria.bia_mejor_distancia IS
  'Distancia al candidato más cercano. Sobre el umbral (0.7) se considera persona distinta.';
COMMENT ON COLUMN public.sgrh_biometria_auditoria.bia_mejor_empleado_id IS
  'Candidato más parecido, informativo para el gerente. NO es una acusación de suplantación.';

COMMENT ON TABLE public.sgrh_documentos IS
  'Metadata de los archivos del expediente. El archivo vive en el bucket privado documentos-empleados; acá solo la ruta y sus atributos.';
COMMENT ON COLUMN public.sgrh_documentos.doc_empresa_id IS
  'Denormalizado igual que en biometría, y además porque el primer segmento del path del bucket ES el empresa_id, que es sobre lo que filtra la RLS de storage.objects.';
COMMENT ON COLUMN public.sgrh_documentos.doc_path IS
  'Ruta en el bucket: <empresa_id>/empleados/<emp_id>/<uuid>.<ext>. NUNCA se expone al cliente: las acciones solo devuelven URLs firmadas de 60 s. UNIQUE porque cada subida usa un uuid nuevo.';
COMMENT ON COLUMN public.sgrh_documentos.doc_mime IS
  'MIME real detectado por magic bytes en el servidor. NUNCA el file.type que declara el cliente.';
COMMENT ON COLUMN public.sgrh_documentos.doc_fecha_vencimiento IS
  'Vencimiento del documento (hoja de delincuencia, certificaciones). NULL = no vence. La UI marca los vencidos.';
