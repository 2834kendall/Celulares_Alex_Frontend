# Propuesta: portal público de reclutamiento

> **Estado: propuesta para decisión, sin código.** Análisis del 2026-08-24, actualizado el
> 2026-11-07 con lo que se construyó desde entonces.

## Qué se pide

Convertir reclutamiento en un **portal público**: cualquier persona ve las vacantes y se postula
adjuntando documentos.

**No es un cambio de UI, es un cambio de modelo de amenaza.** El sistema pasa de tener solo
usuarios autenticados de dos empresas conocidas a recibir entradas de internet abierto, y de
guardar datos de empleados (con relación laboral como base legal) a guardar **datos personales
de terceros**, lo que activa la Ley 8968 y la inscripción ante PRODHAB.

## Qué existe hoy

- **Back-office interno, construido** (bloque B5 del análisis original): candidatos,
  postulaciones con tablero por etapas, puntajes, documentos del candidato, rechazo y
  contratación (vincular la postulación a un empleado). Rutas `/recruitment/...`.
- **Corregido:** la fuga entre empresas en `sgrh_candidatos`, con `cdt_empresa_id` desde
  `20260921000000`.
- **No existe:** tabla de vacantes, acceso público, rate limiting ni antivirus.
- **Sigue bloqueando:** hay hallazgos de seguridad abiertos que tienen que corregirse antes de
  exponer nada a internet. Se registran y se siguen **fuera del repo** (es público), en Jira.

## Bloques de trabajo que faltan

| bloque | contenido | días-persona (estimación de ago-2026) |
|---|---|---:|
| B0 | correcciones de seguridad previas (ver Jira) | 1 – 2 |
| B1 | modelo de datos (`sgrh_vacantes` y relación con postulaciones) | 3 – 5 |
| B2 | acceso público y rate limiting (no hay infraestructura para eso) | 4 – 6 |
| B3 | archivos y antivirus (Supabase no trae; requiere componente externo) | 4 – 6 |
| B4 | portal público + SEO | 8 – 12 |
| B6 | cumplimiento legal (consentimiento, privacidad, retención y purga) | 2 – 4 |
| B7 / B8 | operación, infraestructura (DNS, segundo despliegue) | 5 – 7 |
| — | QA, endurecimiento y prueba de seguridad | 4 – 6 |

Con el back-office ya hecho, lo que resta es aproximadamente **31 a 48 días-persona**, casi todo
exclusivo del portal. **No incluye el trámite ante PRODHAB**, que no depende del equipo y es el
camino crítico más largo: conviene arrancarlo en paralelo apenas se decida.

**Costos recurrentes nuevos:** antivirus, almacenamiento creciente de CVs, segundo despliegue y
dominio, tiempo de RRHH moderando postulaciones falsas y la renovación ante PRODHAB.

## Decisiones abiertas

| tema | opciones | recomendación del análisis |
|---|---|---|
| ¿Se hace el portal? | sí / posponer | el back-office ya resuelve la gestión interna; decidir con el costo real |
| Antivirus | ClamAV propio / servicio externo / no hacerlo | servicio externo |
| Rate limiting | tabla propia con TTL / Upstash / WAF de Cloudflare | Cloudflare primero, tabla como respaldo |
| Identidad del postulante | anónimo / cuenta con magic link | anónimo para postular, enlace firmado para consultar el estado |
| Formatos | PDF / PDF + DOCX | solo PDF |
| Ubicación | misma app / subdominio / app separada | app separada; subdominio si se prioriza la simplicidad |

**Orden sugerido si se aprueba:** B0 → trámite PRODHAB y textos legales en paralelo → B1 →
B2, B3, B4 y B8 como una fase con su propia aprobación → prueba de seguridad antes de exponer.
