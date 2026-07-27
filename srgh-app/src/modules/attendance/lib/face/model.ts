/**
 * Identidad del modelo de embeddings. Vectores generados por modelos
 * distintos NO son comparables: todo lo que guarda o compara vectores filtra
 * por FACE_MODEL_ID, y si algun dia se cambia el .onnx hay que subir la
 * version y re-enrolar (los vectores viejos quedan ignorados, no corruptos).
 */
export const FACE_MODEL_ID = 'mobilefacenet-v1'

/** Dimension del embedding de MobileFaceNet. */
export const FACE_EMBEDDING_DIM = 128

/** Lado (px) de la cara recortada que espera el modelo como entrada. */
export const FACE_INPUT_SIZE = 112
