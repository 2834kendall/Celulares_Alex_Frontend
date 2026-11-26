let audio: AudioContext | undefined

export function prepareConfirmationCue() {
  try {
    const Audio =
      window.AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Audio) return
    // Algunos navegadores solo permiten habilitar el audio durante el toque.
    if (!audio || audio.state === 'closed') audio = new Audio()
    if (audio.state !== 'running') void audio.resume().catch(() => {})
  } catch {
    // La confirmación visual sigue disponible aunque se bloquee el audio.
  }
}

export function playConfirmationCue() {
  try {
    navigator.vibrate?.(80)
  } catch {
    // La vibración depende de los permisos y del dispositivo.
  }

  if (audio?.state !== 'running') return
  try {
    const oscillator = audio.createOscillator()
    const volume = audio.createGain()
    const start = audio.currentTime
    oscillator.frequency.value = 660
    volume.gain.setValueAtTime(0.05, start)
    volume.gain.exponentialRampToValueAtTime(0.001, start + 0.12)
    oscillator.connect(volume)
    volume.connect(audio.destination)
    oscillator.onended = () => {
      oscillator.disconnect()
      volume.disconnect()
    }
    oscillator.start(start)
    oscillator.stop(start + 0.12)
  } catch {
    // Algunos navegadores suspenden el audio durante la espera de red.
  }
}
