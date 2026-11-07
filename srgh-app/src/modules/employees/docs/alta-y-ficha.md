# Alta y ficha del empleado

## Alta (wizard de onboarding)

`/employees/new`, en 4 pasos: **personal → nómina → documentos (opcional) → revisión y
usuario (opcional)**.

- Todo el alta es **una transacción**: la RPC `crear_empleado_completo` escribe dirección,
  empleado, contrato y datos de pago, y si algo falla no queda nada a medias.
- **La invitación del usuario queda fuera** de la RPC: usa la API admin de Auth, que no existe
  en SQL. Si falla, el empleado queda creado y se avisa para reintentar.
- Unicidad en `sgrh_empleados`: cédula, nº de asegurado CCSS y correo personal. Los `NULL`
  no chocan entre sí (el CCSS es opcional). `lib/dbErrors.ts` traduce cada `23505` a un
  mensaje por campo.

### `crear_empleado_completo` es `SECURITY DEFINER` a propósito

Parece candidata obvia a `INVOKER`, pero no funciona. Las inserciones encadenan ids con
`RETURNING`, y en Postgres un `INSERT … RETURNING` con RLS activa **también aplica la policy
de SELECT** a la fila devuelta. `empleados_select` exige que el empleado ya tenga contrato, y
el contrato se inserta _después_. Con `direcciones_select` pasa lo mismo.

**Consecuencia:** como la función se salta la RLS, los chequeos internos son la **única
capa**. Valida `EMPLEADOS_WRITE`, toma `empresa_id` solo del JWT y verifica puesto y sucursal
contra esa empresa. Si se le agrega una tabla, hay que agregarle a mano el permiso que pediría
la policy de INSERT de esa tabla. Ya pasó: escribía en `sgrh_historial_laboral`
(`HISTORIAL_WRITE`, donde están los salarios) validando solo `EMPLEADOS_WRITE`.

**Al cambiar su firma:** `CREATE OR REPLACE` con parámetros nuevos crea una sobrecarga y deja
viva la vieja (PostgREST se vuelve ambiguo). Hay que hacer `DROP FUNCTION` de la firma vieja y
repetir `REVOKE PUBLIC / REVOKE anon / GRANT authenticated`.

## Datos de pago

- **Tabla propia** (`sgrh_empleado_datos_pago`, 1:1): la RLS protege filas, no columnas. En la
  ficha, cualquier rol con `EMPLEADOS_READ` los leería por la API.
  Lectura: `NOMINA_READ` o `EMPLEADOS_WRITE` de la misma empresa, o el propio empleado.
- **Número de cuenta cifrado at-rest.** Las reglas y las tres formas de perder datos están en
  el `CLAUDE.md` de `src/lib/crypto/`. Si se pierde `FIELD_ENCRYPTION_KEY`, no hay forma de
  recuperarlos.
- **Validación sobre el texto plano, antes de cifrar** (`datosPagoSchema` +
  `lib/validateDatosPago.ts`): SINPE → teléfono de 8 dígitos; si no, IBAN `CR` + 20 con
  checksum ISO 13616, y su código de entidad (posiciones 6-8) tiene que coincidir con
  `sgrh_cat_bancos.ban_codigo`. La RPC **ya no** valida formato: recibe ciphertext.
- **Cuentas repetidas:** se detectan con un índice ciego (`edp_cuenta_hmac`, HMAC con llave
  aparte). Si otro empleado de la misma empresa ya tiene esa cuenta, se pide confirmación,
  pero **no se bloquea**: una cuenta compartida puede ser legítima.

## Dirección

- `sgrh_direcciones` es **genérica**: la usan empleado, empresa y sucursal, cada uno por FK
  hacia ella. Por eso la dirección se inserta **antes** que el empleado.
- **Provincia y cantón no se guardan**: se derivan del distrito. Guardarlos permitiría un
  distrito que no pertenece a su cantón.
- **El código postal lo calcula un trigger** desde el código del distrito (en CR, el código
  de distrito de 5 dígitos _es_ el postal). El valor que mande el cliente se ignora.
- Catálogo territorial: IGN 2025 (7 provincias / 84 cantones / 492 distritos).

## Ficha del perfil

| tab / sección                              | permiso                                | notas                                                                                                                                    |
| ------------------------------------------ | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Datos personales                           | `EMPLEADOS_READ` / `EMPLEADOS_WRITE`   | modo edición de la ficha                                                                                                                 |
| Foto (`<Avatar/>`, reusado en toda la app) | `EMPLEADOS_WRITE`                      |                                                                                                                                          |
| Documentos                                 | `DOCUMENTOS_READ` / `DOCUMENTOS_WRITE` | CRUD siempre visible, independiente del modo edición. Por categoría (`sgrh_cat_tipos_documento`), vencimiento opcional y badge "Vencido" |
| Contrato                                   | `HISTORIAL_WRITE`                      | ver [contratos](contratos.md)                                                                                                            |
| Rostro (SGRH-102)                          | `BIOMETRIA_WRITE`                      | ver abajo                                                                                                                                |

**Rostro:** reemplaza a `/kiosco/enrolar`. Tres capturas consistentes con prueba de vida;
las plantillas se guardan cifradas (`sgrh_biometria_empleado`) y las lecturas de estado
devuelven metadatos, nunca la plantilla. Las acciones son del módulo de asistencia
(`attendance/actions/enrollFace.ts`, `getFaceStatus.ts`, `deleteFaceEnrollment.ts`).
`KIOSCO` y `EMPLEADO` no tienen el permiso. Además del permiso, siguen aplicando la empresa,
el alcance por sucursal y el contrato vigente.
