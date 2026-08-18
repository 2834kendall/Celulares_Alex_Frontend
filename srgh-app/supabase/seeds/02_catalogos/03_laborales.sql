-- =====================================================================
-- Catálogos laborales (marco legal de Costa Rica)
-- =====================================================================
-- Identificación, jornadas, contratos, motivos de salida y tipos de
-- ausencia. Los valores legales (recargos, días de preaviso, porcentajes de
-- subsidio) salen del Código de Trabajo y de los reglamentos de CCSS/INS: no
-- son preferencias configurables, cambiarlos requiere respaldo legal.
-- =====================================================================

-- ─── 1. Tipos de identificación ─────────────────────────────────────────────

INSERT INTO public.sgrh_cat_tipos_identificacion (tid_id, tid_codigo, tid_nombre, tid_activo)
OVERRIDING SYSTEM VALUE
VALUES
  (1,  'CED_FIS',          'Cédula de Identidad (Física)',                            true),
  (2,  'CED_JUR',          'Cédula Jurídica',                                         true),
  (3,  'DIMEX',            'DIMEX - Documento de Identidad Migratorio',               true),
  (4,  'PASAPORTE',        'Pasaporte',                                               true),
  (5,  'NITE',             'NITE - Número de Identificación Tributaria Especial',     true),
  (6,  'CARNET_DIPLO',     'Carné Diplomático',                                       true),
  (7,  'CARNET_REFUGIADO', 'Carné de Refugiado ACNUR',                                true),
  (8,  'PERMISO_TRAB',     'Permiso Laboral Temporal (Migración)',                    true),
  (9,  'CED_MENOR',        'Cédula de Menor de Edad',                                 true),
  (10, 'RES_TEMP',         'Residencia Temporal',                                     true)
ON CONFLICT DO NOTHING;

SELECT setval(pg_get_serial_sequence('public.sgrh_cat_tipos_identificacion', 'tid_id'),
              COALESCE((SELECT MAX(tid_id) FROM public.sgrh_cat_tipos_identificacion), 1), true);

-- ─── 2. Tipos de jornada ────────────────────────────────────────────────────
-- Los topes y recargos son los del Código de Trabajo (arts. 135-140).

INSERT INTO public.sgrh_cat_tipos_jornada
  (tjo_id, tjo_codigo, tjo_nombre, tjo_horas_max_diarias, tjo_horas_max_semanales, tjo_recargo_porcentaje)
OVERRIDING SYSTEM VALUE
VALUES
  (1,  'DIURNA',           'Jornada Diurna',                      8,  48, 0),
  (2,  'NOCTURNA',         'Jornada Nocturna',                    6,  36, 50),
  (3,  'MIXTA',            'Jornada Mixta',                       7,  42, 25),
  (4,  'PARCIAL_DIURNA',   'Tiempo Parcial Diurno',               6,  30, 0),
  (5,  'PARCIAL_NOCTURNA', 'Tiempo Parcial Nocturno',             4,  24, 50),
  (6,  'ACUMULATIVA',      'Jornada Acumulativa Semanal',         12, 70, 4),
  (7,  'CONTINUA',         'Jornada Continua',                    6,  36, 0),
  (8,  'EXTRAORDINARIA',   'Jornada Extraordinaria Autorizada',   10, 50, 50),
  (9,  'TELETRABAJO',      'Teletrabajo',                         8,  48, 0),
  (10, 'GUARDIA',          'Jornada de Guardia / Disponibilidad', 12, 48, 30)
ON CONFLICT DO NOTHING;

SELECT setval(pg_get_serial_sequence('public.sgrh_cat_tipos_jornada', 'tjo_id'),
              COALESCE((SELECT MAX(tjo_id) FROM public.sgrh_cat_tipos_jornada), 1), true);

-- ─── 3. Tipos de contrato ───────────────────────────────────────────────────
-- permite_preaviso / permite_cesantia alimentan el cálculo de liquidaciones.

INSERT INTO public.sgrh_cat_tipos_contrato
  (tco_id, tco_codigo, tco_nombre, tco_permite_preaviso, tco_permite_cesantia, tco_nota_legal)
OVERRIDING SYSTEM VALUE
VALUES
  (1,  'INDEF',          'Contrato por Tiempo Indefinido',        true,  true,  'Art. 26 Código de Trabajo'),
  (2,  'PLAZO_FIJO',     'Contrato a Plazo Fijo',                 false, false, 'Art. 26 y 31 Código de Trabajo'),
  (3,  'OBRA_DET',       'Contrato por Obra Determinada',         false, false, 'Art. 26 Código de Trabajo'),
  (4,  'TIEMPO_PARCIAL', 'Contrato a Tiempo Parcial',             true,  true,  'Art. 26 Código de Trabajo, jornada reducida'),
  (5,  'TEMPORADA',      'Contrato de Temporada',                 false, false, 'Actividades estacionales o de temporada alta'),
  (6,  'PRUEBA',         'Contrato en Período de Prueba',         false, false, 'Art. 30 Código de Trabajo, primeros 3 meses'),
  (7,  'APRENDIZ',       'Contrato de Aprendizaje',               false, false, 'Convenio INA - formación dual'),
  (8,  'SERV_PROF',      'Contrato por Servicios Profesionales',  false, false, 'Servicios profesionales no subordinados'),
  (9,  'SUSTITUCION',    'Contrato de Sustitución',               false, false, 'Reemplazo temporal por incapacidad o licencia'),
  (10, 'PASANTIA',       'Contrato de Pasantía',                  false, false, 'Convenio de práctica profesional')
ON CONFLICT DO NOTHING;

SELECT setval(pg_get_serial_sequence('public.sgrh_cat_tipos_contrato', 'tco_id'),
              COALESCE((SELECT MAX(tco_id) FROM public.sgrh_cat_tipos_contrato), 1), true);

-- ─── 4. Motivos de salida ───────────────────────────────────────────────────

INSERT INTO public.sgrh_cat_motivos_salida
  (mot_id, mot_codigo, mot_nombre, mot_genera_preaviso, mot_genera_cesantia, mot_nota_legal)
OVERRIDING SYSTEM VALUE
VALUES
  (1,  'REN001', 'Renuncia Voluntaria',                     false, false, 'Art. 28 Código de Trabajo. No genera preaviso ni cesantía a cargo del patrono.'),
  (2,  'DES001', 'Despido con Responsabilidad Patronal',     true,  true,  'Art. 28 y 29 Código de Trabajo. Genera preaviso y cesantía.'),
  (3,  'DES002', 'Despido sin Responsabilidad Patronal',     false, false, 'Art. 81 Código de Trabajo. Causa justa, no genera preaviso ni cesantía.'),
  (4,  'MUT001', 'Mutuo Acuerdo entre las Partes',           false, true,  'Se pacta condición de salida entre empleado y patrono.'),
  (5,  'FIN001', 'Fin de Contrato a Plazo Fijo',             false, false, 'Art. 31 Código de Trabajo. Vencimiento natural del plazo pactado.'),
  (6,  'FIN002', 'Fin de Obra Determinada',                  false, false, 'Art. 26 Código de Trabajo.'),
  (7,  'PEN001', 'Pensión por Vejez',                        true,  true,  'Art. 28 Código de Trabajo, jubilación CCSS.'),
  (8,  'PEN002', 'Pensión por Invalidez',                    true,  true,  'Retiro por dictamen de invalidez de la CCSS.'),
  (9,  'FAL001', 'Fallecimiento del Trabajador',             false, true,  'Art. 85 inciso e) Código de Trabajo. Cesantía a derechohabientes.'),
  (10, 'ABA001', 'Abandono de Trabajo',                      false, false, 'Art. 81 inciso j) Código de Trabajo.'),
  (11, 'RED001', 'Reducción de Personal',                    true,  true,  'Cierre de operaciones o reducción justificada de personal.'),
  (12, 'PER001', 'No Superación del Período de Prueba',      false, false, 'Art. 30 Código de Trabajo, primeros 3 meses.'),
  (13, 'TRA001', 'Traslado a Otra Empresa del Grupo',        false, false, 'Movimiento interno sin ruptura de relación laboral.'),
  (14, 'INC001', 'Incapacidad Permanente',                   true,  true,  'Dictamen médico de incapacidad total para laborar.'),
  (15, 'CIE001', 'Cierre Definitivo de la Empresa',          true,  true,  'Art. 85 Código de Trabajo, cese total de operaciones.')
ON CONFLICT DO NOTHING;

SELECT setval(pg_get_serial_sequence('public.sgrh_cat_motivos_salida', 'mot_id'),
              COALESCE((SELECT MAX(mot_id) FROM public.sgrh_cat_motivos_salida), 1), true);

-- ─── 5. Tipos de ausencia ───────────────────────────────────────────────────
-- Estado ya consolidado: en el proyecto original este catálogo pasó por un
-- ciclo seed → fix → dedupe antes de estabilizarse. Acá se siembra el
-- resultado final directamente.
--
-- tau_es_intradia = true solo en lactancia: se mide en horas dentro del día,
-- no en días completos.

INSERT INTO public.sgrh_cat_tipos_ausencia (
  tau_id, tau_codigo, tau_nombre, tau_requiere_documento_ccss,
  tau_paga_empleador_dias, tau_porcentaje_pago_empleador,
  tau_paga_ccss_desde_dia, tau_porcentaje_subsidio_ccss,
  tau_descuenta_vacaciones, tau_es_protegida, tau_referencia_legal, tau_es_intradia
)
OVERRIDING SYSTEM VALUE
VALUES
  (1,  'INC_ENF',  'Incapacidad por Enfermedad',        true,  3,   50,  4,    60,   false, false, 'Reglamento del Seguro de Salud CCSS, arts. 36-40', false),
  (2,  'INC_MAT',  'Incapacidad por Maternidad',        true,  120, 50,  1,    50,   false, true,  'Codigo de Trabajo, art. 95 (4 meses; 50% patrono + 50% CCSS)', false),
  (3,  'INC_RT',   'Incapacidad por Riesgo de Trabajo', true,  0,   0,   1,    60,   false, true,  'Codigo de Trabajo Titulo IV; Ley de Riesgos del Trabajo (INS, subsidio 60% desde dia 1)', false),
  (4,  'VAC',      'Vacaciones',                        false, 0,   100, NULL, NULL, true,  false, 'Art. 153 Código de Trabajo', false),
  (5,  'PERM_CG',  'Permiso con Goce de Salario',       false, 1,   100, NULL, NULL, false, false, 'Política interna de la empresa', false),
  (6,  'PERM_SG',  'Permiso sin Goce de Salario',       false, 0,   0,   NULL, NULL, false, false, 'Art. 45 Código de Trabajo', false),
  (7,  'LIC_PAT',  'Licencia de Paternidad',            true,  8,   50,  1,    50,   false, true,  'Ley N. 10211 (2022); Codigo de Trabajo (8 dias, 50% CCSS + 50% patrono)', false),
  (8,  'DUELO',    'Permiso por Duelo',                 false, 3,   100, NULL, NULL, false, false, 'Convención colectiva / política interna', false),
  (9,  'MATRIM',   'Permiso por Matrimonio',            false, 3,   100, NULL, NULL, false, false, 'Política interna de la empresa', false),
  (10, 'CITA_MED', 'Cita Médica',                       false, 1,   100, NULL, NULL, false, false, 'Política interna de la empresa', false),
  (11, 'LACT',     'Permiso de Lactancia',              false, 0,   100, NULL, NULL, false, true,  'Codigo de Trabajo, art. 97 (1 hora diaria, 100% pagada por patrono)', true),
  (12, 'ESTUDIO',  'Permiso por Estudios',              false, 0,   0,   NULL, NULL, false, false, 'Política interna de la empresa', false),
  (13, 'SIND',     'Permiso Sindical',                  false, 0,   100, NULL, NULL, false, true,  'Código de Trabajo, fuero sindical', false),
  (14, 'JUD',      'Comparecencia Judicial',            false, 1,   100, NULL, NULL, false, false, 'Obligación legal de comparecencia', false),
  (15, 'HUELGA',   'Ausencia por Huelga Legal',         false, 0,   0,   NULL, NULL, false, true,  'Art. 371 Código de Trabajo', false)
ON CONFLICT DO NOTHING;

SELECT setval(pg_get_serial_sequence('public.sgrh_cat_tipos_ausencia', 'tau_id'),
              COALESCE((SELECT MAX(tau_id) FROM public.sgrh_cat_tipos_ausencia), 1), true);
