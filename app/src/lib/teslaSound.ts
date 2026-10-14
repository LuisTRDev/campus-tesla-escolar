import { useEffect, useState } from 'react'

// ---------------------------------------------------------------------------
// Sonidos suaves del Perfil Tesla (subir de nivel, abrir cofres, felicitar).
// Se sintetizan con Web Audio: no hay archivos que descargar ni que cumplan la
// CSP. Vienen apagados; cada alumno los activa en Personalizar y queda guardado
// en el dispositivo.
// ---------------------------------------------------------------------------
const KEY = 'tesla-sounds'
const EVENT = 'tesla-sounds-change'

export function soundsEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function setSoundsEnabled(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? '1' : '0')
  } catch {
    // Sin almacenamiento simplemente no se recuerda.
  }
  window.dispatchEvent(new Event(EVENT))
}

export function useSoundsEnabled(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(soundsEnabled)
  useEffect(() => {
    const sync = () => setOn(soundsEnabled())
    window.addEventListener(EVENT, sync)
    return () => window.removeEventListener(EVENT, sync)
  }, [])
  return [on, setSoundsEnabled]
}

type Note = { f: number; at: number; dur: number; type?: OscillatorType; gain?: number }

const SOUNDS: Record<'levelup' | 'chest' | 'reveal' | 'pop' | 'equip', Note[]> = {
  levelup: [
    { f: 523.25, at: 0, dur: 0.14 }, { f: 659.25, at: 0.12, dur: 0.14 }, { f: 783.99, at: 0.24, dur: 0.14 },
    { f: 1046.5, at: 0.36, dur: 0.5, type: 'triangle' }, { f: 1318.5, at: 0.36, dur: 0.5, type: 'sine', gain: 0.06 },
  ],
  chest: [
    { f: 196, at: 0, dur: 0.08, type: 'square', gain: 0.04 }, { f: 220, at: 0.18, dur: 0.08, type: 'square', gain: 0.04 },
    { f: 247, at: 0.36, dur: 0.08, type: 'square', gain: 0.04 }, { f: 262, at: 0.54, dur: 0.08, type: 'square', gain: 0.05 },
  ],
  reveal: [
    { f: 784, at: 0, dur: 0.12, type: 'triangle' }, { f: 988, at: 0.1, dur: 0.12, type: 'triangle' },
    { f: 1175, at: 0.2, dur: 0.12, type: 'triangle' }, { f: 1568, at: 0.3, dur: 0.6, type: 'sine' },
  ],
  pop: [{ f: 880, at: 0, dur: 0.07, type: 'sine' }, { f: 1320, at: 0.05, dur: 0.1, type: 'sine', gain: 0.05 }],
  equip: [{ f: 660, at: 0, dur: 0.06, type: 'triangle', gain: 0.05 }, { f: 990, at: 0.06, dur: 0.08, type: 'triangle', gain: 0.05 }],
}

let ctx: AudioContext | null = null

export function playSound(name: keyof typeof SOUNDS) {
  if (!soundsEnabled()) return
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    ctx ??= new AC()
    if (ctx.state === 'suspended') void ctx.resume()
    const now = ctx.currentTime + 0.02
    for (const n of SOUNDS[name]) {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = n.type ?? 'sine'
      osc.frequency.value = n.f
      const peak = n.gain ?? 0.08
      g.gain.setValueAtTime(0, now + n.at)
      g.gain.linearRampToValueAtTime(peak, now + n.at + 0.015)
      g.gain.exponentialRampToValueAtTime(0.0001, now + n.at + n.dur)
      osc.connect(g).connect(ctx.destination)
      osc.start(now + n.at)
      osc.stop(now + n.at + n.dur + 0.05)
    }
  } catch {
    // El sonido es un adorno: si el navegador no lo permite, no pasa nada.
  }
}
