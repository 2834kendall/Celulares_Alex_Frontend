import { useCallback, useEffect, useRef, useState } from 'react'

/* How long after the last keystroke the user still counts as typing. */
const TYPING_IDLE_MS = 700

/**
 * "Is the user typing right now?" for the illustrated scenes: call the
 * returned function on every keystroke and the flag stays on until the keys
 * go quiet. It only re-renders when the flag flips, not on each key.
 */
export function useTypingSignal() {
  const [typing, setTyping] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    },
    []
  )

  const signalTyping = useCallback(() => {
    setTyping(true)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setTyping(false), TYPING_IDLE_MS)
  }, [])

  return [typing, signalTyping] as const
}
