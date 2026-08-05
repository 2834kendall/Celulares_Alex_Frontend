# Modelos del reconocimiento facial

Este directorio aloja los assets que el kiosco usa EN EL NAVEGADOR (la foto
nunca sale del dispositivo; al servidor solo viaja el embedding cifrado).

## Archivos versionados (se autodescargan si faltan)

| Archivo                             | Que es                                               | Fuente                                          |
| ----------------------------------- | ---------------------------------------------------- | ----------------------------------------------- |
| `face_landmarker.task`              | MediaPipe Face Landmarker (deteccion + blendshapes)  | Bucket oficial de Google.                       |
| `face-api/face_recognition_model-*` | Red de reconocimiento, embeddings de 128 dimensiones | `@vladmandic/face-api` (ver procedencia abajo). |

`scripts/setup-face-assets.mjs` los descarga solos si faltan (corre en
`predev`/`prebuild`) — no hace falta tocarlos a mano.

### Procedencia del modelo de reconocimiento (por que se pudo automatizar)

A diferencia de MobileFaceNet (que se investigo primero y se descarto: sin
fuente oficial unica, puros repos de terceros de procedencia dudosa — algunos
literalmente copias identicas entre cuentas sin relacion, señal clasica de
repos espejo/spam), estos pesos SI se verificaron de punta a punta antes de
automatizar la descarga:

- **Los pesos en si**: entrenados por `davisking` (creador de `dlib`, una
  libreria de vision por computadora con mas de una decada de trayectoria).
  Licencia **Boost Software License 1.0** — uso comercial explicitamente
  permitido.
- **face-api.js** (quien los empaqueta para el navegador): licencia **MIT**.
  El propio mantenedor confirmo por escrito que el uso comercial esta
  permitido ([issue #338](https://github.com/justadudewhohacks/face-api.js/issues/338)).
- Se usa el fork **`@vladmandic/face-api`** (no el paquete original) porque
  el original quedo sin publicar en npm desde 2020; el fork sigue mantenido
  activamente.

Arquitectura: ResNet-34 tipo dlib, entrada 150x150 (face-api.js reescala
internamente — el recorte que arma `faceCropBox` no necesita cambiar),
salida de 128 dimensiones (`FACE_EMBEDDING_DIM`).

## Modo de prueba (si falta el modelo)

Con `NEXT_PUBLIC_FACE_TEST_MODE=true`, el kiosco usa `testEmbedding.ts` — un
calculo determinista de luminancia, NO reconocimiento facial real — para
poder probar el resto del pipeline (camara, cifrado, umbrales, ticket,
marca) sin el modelo. Nunca debe quedar activo en produccion.

## Archivos generados (NO versionar)

`mediapipe-wasm/` lo copia `scripts/setup-face-assets.mjs` desde
node_modules (corre solo en `predev`/`prebuild`). Esta en `.gitignore`.
