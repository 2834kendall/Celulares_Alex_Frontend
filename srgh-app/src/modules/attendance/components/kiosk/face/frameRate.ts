const WINDOW_MS = 1500

export function createFrameRateMeter() {
  const timestamps: number[] = []

  return {
    record(timestamp: number): number {
      if (timestamps.at(-1) !== timestamp) timestamps.push(timestamp)
      while (timestamps[0] < timestamp - WINDOW_MS) {
        timestamps.shift()
      }
      const elapsed = timestamp - timestamps[0]
      return elapsed > 0 ? ((timestamps.length - 1) * 1000) / elapsed : 0
    },
  }
}

export function analysisStride(fps: number): 1 | 2 | 3 {
  if (fps >= 12) return 1
  return fps >= 6 ? 2 : 3
}
