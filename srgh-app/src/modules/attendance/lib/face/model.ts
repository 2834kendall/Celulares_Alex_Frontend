/**
 * Identidad del modelo de embeddings. Vectores generados por modelos
 * distintos NO son comparables: todo lo que guarda o compara vectores filtra
 * por FACE_MODEL_ID, y si algun dia se cambia el modelo hay que subir la
 * version y re-enrolar (los vectores viejos quedan ignorados, no corruptos).
 *
 * v2 (2026-07-31): mismos pesos que v1, pero la v1 guardaba el vector
 * L2-normalizado y comparaba con coseno — invalido para descriptores dlib
 * (ver faceMath.ts). La v2 guarda el descriptor crudo y compara euclideo,
 * asi que los vectores v1 son incomparables y quedan fuera por este filtro.
 */
export const FACE_MODEL_ID = 'face-api-resnet34-v2'

/** Dimension del embedding de la red de reconocimiento de face-api.js. */
export const FACE_EMBEDDING_DIM = 128

/**
 * Lado (px) de la cara recortada que se le pasa al modelo. face-api.js
 * reescala internamente a 150x150 — se captura ya a ese tamaño para no
 * perder calidad con un downscale-then-upscale innecesario.
 */
export const FACE_INPUT_SIZE = 150
