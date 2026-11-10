# Kiosco y reconocimiento facial

Ruta: `/kiosco` (grupo `(kiosk)`). Funciona en teléfonos, tablets y computadoras. Las cuentas
de kiosco se registran en Configuración → Sucursales
([sucursales y kioscos](../../settings/docs/sucursales-y-kioscos.md)).

## Modelo de acceso

- **La cuenta `KIOSCO` solo tiene `ASISTENCIA_KIOSCO`**: ningún permiso que le abra tablas.
  Todo lo que el kiosco lee o escribe (programación, contratos, rostros, marcas, ausencias) lo
  hace **el servidor con el cliente admin**, después de `requireKioskAccess`
  (`lib/kioskAccess.ts`), siempre acotado a la empresa del JWT y a la sucursal de la cuenta.
- `ASISTENCIA_WRITE` también se acepta, para el encargado que abre el kiosco con su cuenta.
- **El acceso se revalida en cada request** (`lib/liveKioskAccess.ts`): usuario, asignación,
  sucursal activa y registro del kiosco. `React.cache` solo comparte la lectura dentro de un
  mismo render, nunca entre reconocer, pedir opciones y guardar.
- **Kiosco sin sucursal = error de configuración.** Nunca se cae a "toda la empresa" en un
  dispositivo expuesto.

## Quién aparece

**Solo quien trabaja HOY en la sucursal del kiosco** (`getScheduledEmployees`). Se arma desde la
programación del día (`lib/workingDay.ts`), no desde la sucursal base del contrato: así aparece
quien fue trasladado ese día. Quien no está programado no aparece ni puede marcar (decisión del
cliente, 2026-09-17). Tampoco puede marcar quien tiene una ausencia aprobada ese día; los tipos
intradía (lactancia) no cuentan.

## Identificación facial

1. El navegador captura, comprueba prueba de vida y calcula el descriptor (MediaPipe +
   face-api; con fallback de GPU a CPU/WASM). **La foto nunca sale del navegador**: viaja el
   descriptor cifrado.
2. `verifyFace` lo descifra y lo compara (distancia **euclídea**, no coseno: ver
   `lib/face/faceMath.ts`) solo contra los empleados activos de la sucursal:
   - **MATCH** si la distancia es < 0,5 (confianza alta si < 0,4);
   - **REQUIRE_PIN** entre 0,5 y 0,6, o si nadie de la sucursal tiene rostro enrolado;
   - **DENIED** si es > 0,6, con registro de auditoría.
   - Si dos empleados distintos pasan el umbral, se pide recapturar.
3. **Prueba de vida:** puntaje ≥ 0,6 con al menos 5 muestras, en el cliente y en el servidor.
4. **Ticket facial** (`lib/face/faceTicket.ts`): `verifyFace` emite un ticket HMAC-SHA256 de TTL
   corto, atado al empleado, la empresa, la sucursal, el kiosco y la versión de acceso. Sin él,
   una marca "facial" se podría falsificar con un fetch a mano. Bloquear o reasignar el kiosco
   sube la versión de acceso y anula los tickets viejos.

**Enrolamiento:** desde el tab Rostro del perfil del empleado (`BIOMETRIA_WRITE`, SGRH-102), no
desde el kiosco. Son tres capturas a ≥ 150 ms entre sí, que tienen que coincidir bajo el umbral
de 0,5. Se guarda la **medoide** (una muestra real), con el mismo modelo de 128 dimensiones.
Exige prueba de vida: un enrolamiento hecho con una foto dejaría suplantable a esa persona para
siempre.

## Guardar la marca

- **`registrar_marca_kiosco_atomica`** (`20261106032247_kiosk_atomic_mark.sql`): `SECURITY
INVOKER`, ejecutable solo con `service_role`. La acción valida ticket, empresa, sucursal,
  contrato, ausencia y secuencia; la función usa un advisory lock por contrato y día, vuelve a
  comparar la jornada con lo validado y rechaza si cambió.
- **Cada marca tiene un UUID de operación** generado antes del primer intento y reusado en los
  reintentos: un reintento después de perder la respuesta no duplica la marca.
- **El GPS se pide después del reconocimiento** y nunca demora el guardado: si no está, va
  `null`.

## Cola offline

`components/kiosk/useOfflineSync`. Cubre una marca enviada **después** de un reconocimiento
exitoso; **identificar a alguien sin conexión no es posible**.

- Orden: hora del evento, después hora local de encolado, después id. Se drena al arrancar con
  conexión y al reconectar.
- Un fallo pasajero retiene los eventos siguientes **de ese empleado**; los demás siguen. Un
  rechazo `definitivo` (no programado, rostro no verificado, contrato cerrado) no se reintenta:
  queda archivado con su motivo.
- Un kiosco bloqueado o reasignado no puede enviar sus pendientes. Los borradores de un
  navegador se revisan en `/settings/branches/pending`.

## Requisitos y diagnóstico

- HTTPS, permiso de cámara, WebAssembly, Web Crypto y almacenamiento local. Si falta la cámara
  o el modelo, **se rechaza la captura**: nunca se salta la verificación de identidad.
- `NEXT_PUBLIC_FACE_DEBUG=true` (solo desarrollo) mide modelos, captura, cifrado, verificación y
  guardado, sin nombres ni descriptores.
- `NEXT_PUBLIC_FACE_TEST_MODE` es solo para pruebas locales: **nunca en un build de
  producción**.

## Pendiente

- Validar en Android, iOS y escritorio reales (arranque en frío y caliente, uso sostenido,
  anteojos, contraluz, dos personas, cámara denegada). Solo se probó en desarrollo.
- Los umbrales de luz y nitidez y un margen más fino entre dos candidatos necesitan datos
  representativos para calibrarse.
