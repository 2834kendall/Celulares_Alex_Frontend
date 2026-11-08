# Marcas, tardías y advertencias

## Tipos de marca

`entrada`, `inicio_receso`, `fin_receso`, `inicio_almuerzo`, `fin_almuerzo`, `salida`
(`lib/marks.ts`). Van en minúscula; no hay `CHECK` en la base, así que la validación vive solo
en la aplicación.

**Qué marca se puede hacer ahora** (`lib/marks.ts`, SGRH-88). Hay dos reglas y nada más:

- un período abierto (receso o almuerzo) bloquea todo menos su propio cierre;
- cada período se toma una vez por día.

Antes de la entrada solo se puede entrar, y después de la salida no queda nada que marcar.
**Salir no exige haber tomado el almuerzo** (decisión del cliente, 2026-09-17). El receso solo
se ofrece si el horario del día lo contempla.

El kiosco solo muestra los botones permitidos, pero **la regla la aplica `registerKioskMark`**:
esconder un botón no es una regla, porque la acción se puede invocar directo.

## Tiempos

- **Almuerzo:** una hora fija para todos (`LUNCH_MINUTES = 60`), diga lo que diga el horario
  del día (SGRH-95). Volver tarde del almuerzo es una tardía aparte de la de entrada.
- **Receso pagado:** 10 minutos (`PAID_BREAK_MINUTES`). Solo el exceso se descuenta de las
  horas. **Es la misma regla que `schedules/lib/hours.ts`**: si cambia una, cambia la otra.
- **Zona horaria:** Costa Rica es siempre UTC−6, pero se usa `Intl` con `timeZone` explícito
  (`lib/time.ts`): el servidor puede correr en UTC y desfasaría cada marca 6 horas.
- **Geocerca:** se calcula la distancia a la sucursal (Haversine) y se guarda en
  `mar_distancia_geocerca_metros`. **Es solo informativa**: no rechaza marcas fuera de radio.

## Tipos de tardía (catálogo por empresa)

- `sgrh_cat_tipos_tardia` guarda **solo el minuto donde empieza cada tipo**: termina un minuto
  antes del siguiente y el último queda abierto. Así no se pueden configurar huecos ni
  solapamientos.
- Por defecto, en cada empresa: **leve desde el minuto 1, tardía desde el 6, grave desde el 11**.
  `deleteTipoTardia` no deja borrar el último.
- "Llegar tarde" empieza en el minuto del primer tipo. Ese umbral reemplazó a la tolerancia por
  sucursal, que se retiró.
- Asistencia **solo lee** el catálogo; se administra en Configuración →
  `/settings/attendance/tardiness-types` (`CATALOGOS_WRITE`).
- Si la lectura del catálogo falla, se devuelve el error, **no** se cae a los tipos por defecto:
  clasificar con reglas que no son las de la empresa, sin decirlo, es peor.

## Clasificar un día y advertir

`lib/infractions.ts`:

- Día libre, feriado, sin programación o **cubierto por una ausencia justificada**: no cuenta
  ni a favor ni en contra. La ausencia justificada se evalúa primero y gana: el horario se
  publica antes de que la gente se enferme (SGRH-72).
- **Justificar una tardía** (`justifyTardiness`): un encargado declara que no es
  responsabilidad del colaborador. Se sigue viendo en el reporte, pero no cuenta. Se notifica
  al colaborador al ponerla **y al quitarla**: quitarla le devuelve una tardía al conteo.
- **Advertencia del mes:** **3 tardías o 1 ausencia** la disparan, como máximo una vez por mes
  por empleado (`sgrh_notificaciones`). Qué tipos suman lo decide el catálogo
  (`tta_cuenta_advertencia`; por defecto, los tres). Se calcula **bajo demanda** al abrir el
  panel diario (`checkMonthlyInfractions`): no hay job programado.

## Marcas manuales

`saveManualMark` (`ASISTENCIA_WRITE`): el encargado registra o corrige una marca desde el
panel. Notifica al colaborador con "mejor esfuerzo": si la notificación falla, la marca queda
guardada.

## Pendiente

- Los límites 3 y 1 están fijos en el código (decisión del equipo, 2026-07-26). Falta decidir
  si pasan a ser configurables por el gerente (backlog de SGRH-21).
