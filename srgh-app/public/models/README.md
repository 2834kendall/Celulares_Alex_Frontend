# Modelos del reconocimiento facial

Este directorio aloja los assets que el kiosco usa EN EL NAVEGADOR (la foto
nunca sale del dispositivo; al servidor solo viaja el embedding cifrado).

## Archivos versionados (descargar una vez, commitear)

| Archivo                | Que es                                              | Fuente                                                                                                              |
| ---------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `face_landmarker.task` | MediaPipe Face Landmarker (deteccion + blendshapes) | Bucket oficial de Google. `scripts/setup-face-assets.mjs` lo descarga solo si falta — no hace falta tocarlo a mano. |
| `mobilefacenet.onnx`   | MobileFaceNet, embeddings de 128 dimensiones        | `scripts/export_mobilefacenet.py` (ver abajo) — a proposito SIN autodescarga.                                       |

### Como generar `mobilefacenet.onnx`

No existe una fuente oficial unica de MobileFaceNet en ONNX (son conversiones
de comunidad de procedencia variable), y este vector es literalmente el dato
que decide "es este empleado o no" — por eso no se autodescarga un binario de
terceros. En su lugar:

```bash
pip install torch onnx onnxruntime numpy
python scripts/export_mobilefacenet.py --weights /ruta/a/tus_pesos.pth
```

El script construye la arquitectura estandar de MobileFaceNet (Chen et al., 2018) localmente y solo la exporta a partir de pesos (`--weights`) que tu
elijas y puedas auditar — nunca descarga nada por su cuenta. Verifica el
export en dos niveles antes de terminar: la forma de salida (1x128) y que el
resultado del `.onnx` coincida numericamente con el de PyTorch.

Debe quedar con entrada `float32[1,3,112,112]` (NCHW, normalizacion
(x-127.5)/128) y salida de 128 dimensiones — el script ya lo garantiza. Si
algun dia se usa un modelo con otra dimension de salida, ajustar
`FACE_EMBEDDING_DIM` en `src/modules/attendance/lib/face/model.ts` y subir la
version de `FACE_MODEL_ID` (los vectores enrolados con el modelo viejo se
ignoran y hay que re-enrolar).

## Archivos generados (NO versionar)

`mediapipe-wasm/` y `ort-wasm/` los copia `scripts/setup-face-assets.mjs`
desde node_modules (corre solo en `predev`/`prebuild`). Estan en .gitignore.
