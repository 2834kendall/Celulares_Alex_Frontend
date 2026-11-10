/** Opt-in timings only: never include identity, image, descriptor or payload. */
export async function timeFaceStage<T>(
  stage: 'models' | 'embedding' | 'encrypt' | 'verify' | 'options' | 'mark',
  run: () => Promise<T>
): Promise<T> {
  const start = performance.now()
  try {
    return await run()
  } finally {
    if (process.env.NEXT_PUBLIC_FACE_DEBUG === 'true') {
      console.info('[kiosk timing]', stage, Math.round(performance.now() - start), 'ms')
    }
  }
}
