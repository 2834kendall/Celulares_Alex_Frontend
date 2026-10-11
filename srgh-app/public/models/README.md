# Modelos del reconocimiento facial

Este directorio aloja los assets que el kiosco usa EN EL NAVEGADOR (la foto
nunca sale del dispositivo; al servidor solo viaja el embedding cifrado).

## Archivos versionados (se autodescargan si faltan)

| Archivo                             | Que es                                                   | Fuente                                          |
| ----------------------------------- | -------------------------------------------------------- | ----------------------------------------------- |
| `face_landmarker.task`              | MediaPipe Face Landmarker (deteccion + blendshapes)      | Bucket oficial de Google.                       |
| `face-api/face_recognition_model-*` | Red de reconocimiento, embeddings de 128 dimensiones     | `@vladmandic/face-api` (ver procedencia abajo). |
| `antispoof/minifasnet_v2.onnx`      | Clasificador anti-spoofing (real / impresion / pantalla) | MiniFASNetV2 de minivision-ai (ver abajo).      |

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

## Clasificador anti-spoofing (SGRH-80)

`antispoof/minifasnet_v2.onnx` es lo que impide que una fotografia marque
asistencia. Corre con `onnxruntime-web` y decide si lo que ve la camara es una
persona o una reproduccion (papel impreso o pantalla), analizando el MATERIAL
—grano, muare, reflejo especular, bordes— y no la geometria del rostro. Por eso
es indiferente a los lentes.

### Procedencia (verificada antes de descargar, igual que los otros)

- **Pesos originales**: [minivision-ai/Silent-Face-Anti-Spoofing](https://github.com/minivision-ai/Silent-Face-Anti-Spoofing),
  de MiniVision Technology. Licencia **Apache-2.0**, uso comercial permitido y
  con concesion expresa de patentes (Seccion 3) — mas protectora para uso
  empresarial que una MIT. Benchmarks publicados por el autor: TPR 97.8% (modelo
  rapido) y 99.7% (alta precision) a FPR 1e-5.
- **Checkpoint exacto**: `2.7_80x80_MiniFASNetV2.pth`.
- **Distribucion ONNX**: [garciafido/minifasnet-v2-anti-spoofing-onnx](https://huggingface.co/garciafido/minifasnet-v2-anti-spoofing-onnx),
  que declara pesos **bit-equivalentes** al `.pth` oficial (solo cambia el
  formato de serializacion) y documenta la conversion (torch 2.2.2 → ONNX opset
  11), con el script incluido.
- **SHA-256 del archivo en uso**:
  `d7b3cd9ba8a7ceb13baa8c4720902e27ca3112eff52f926c08804af6b6eecc7b`.
  `scripts/setup-face-assets.mjs` lo verifica en cada build y avisa si cambia.

### Lo que se DESCARTO, y por que

- **Puertos ONNX de terceros** (varias cuentas sin relacion publicando repos con
  descripcion identica palabra por palabra): el mismo patron de repos
  espejo/spam por el que ya se habia rechazado MobileFaceNet.
- **`vladmandic/human`**: reusaria TensorFlow.js sin dependencias nuevas y es del
  mismo mantenedor que `face-api`, pero su wiki dice que los modelos "heredan la
  licencia de la fuente original" **sin nombrar fuente** para su modelo de
  liveness, y su `antispoof` se entreno con un dataset de Kaggle de 1k reales /
  1k falsas sin metricas publicadas. No pasa el estandar de este repo.

### Convencion de entrada — VERIFICADA EMPIRICAMENTE, no leida

**La ficha del modelo publicada rio abajo documenta MAL dos cosas criticas.**
Seguirla habria puesto en produccion un clasificador saturado E invertido. Se
contrasto contra las imagenes de muestra del repo oficial, que traen la verdad
en el nombre (`image_T1` real, `image_F1`/`image_F2` falsas):

| Cosa          | Dice la ficha   | Lo correcto (medido)                           |
| ------------- | --------------- | ---------------------------------------------- |
| Normalizacion | dividir por 255 | **NO dividir**, 0..255 crudo                   |
| Canales       | —               | **BGR** (con RGB clasifica todo como real)     |
| Clase real    | indice 0        | **indice 1** (coincide con el test.py oficial) |

Margenes obtenidos con la convencion correcta: rostro real **0.999**, foto de
una foto **0.011**. Con `/255` la red se satura y devuelve practicamente la
misma salida para cualquier imagen.

Todo esto esta documentado tambien en `antispoof.ts`, y hay una prueba
(`antispoof.test.ts`) que fija `REAL_CLASS_INDEX = 1` para que nadie lo
"corrija" siguiendo la ficha.

## Archivos generados por onnxruntime (NO versionar)

`ort/` lo copia `scripts/setup-face-assets.mjs` desde node_modules, igual que
`mediapipe-wasm/`. Solo se copia el par `ort-wasm-simd-threaded.{wasm,mjs}`: el
paquete trae ademas variantes para WebGPU/WebNN que suman unos 70 MB y no se
usan, porque `antispoof.ts` fuerza el backend WASM con un solo hilo (los
workers multihilo exigirian cabeceras COOP/COEP que el kiosco no sirve).

## Modo de prueba (si falta el modelo)

Con `NEXT_PUBLIC_FACE_TEST_MODE=true`, el kiosco usa `testEmbedding.ts` — un
calculo determinista de luminancia, NO reconocimiento facial real — para
poder probar el resto del pipeline (camara, cifrado, umbrales, ticket,
marca) sin el modelo. Nunca debe quedar activo en produccion.

## Archivos generados (NO versionar)

`mediapipe-wasm/` lo copia `scripts/setup-face-assets.mjs` desde
node_modules (corre solo en `predev`/`prebuild`). Esta en `.gitignore`.
