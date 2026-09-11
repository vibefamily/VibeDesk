/**
 * UI store - global display preferences.
 *
 * Currently exposes the interface zoom (Small / Normal / Large) applied
 * to the whole desktop, so window titles, chat text, icons and spacing
 * scale together - like the Windows display size setting.
 */

import { create } from 'zustand'

export type UiScale = 'small' | 'normal' | 'large'

const KEY = 'vibedesk.uiScale'

const SCALE_VALUE: Record<UiScale, number> = {
  small: 0.9,
  normal: 1,
  large: 1.25,
}

const SCALE_LABEL: Record<UiScale, string> = {
  small: 'Small (90%)',
  normal: 'Normal (100%)',
  large: 'Large (125%)',
}

interface UiState {
  scale: UiScale
  zoom: number
  setScale: (scale: UiScale) => void
}

function loadSaved(): UiScale {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'small' || saved === 'large') return saved
  } catch {
    // localStorage unavailable (rare in Electron); fall through
  }
  return 'normal'
}

export const useUiStore = create<UiState>((set) => {
  const scale = loadSaved()
  return {
    scale,
    zoom: SCALE_VALUE[scale],
    setScale: (next) => {
      try {
        localStorage.setItem(KEY, next)
      } catch {
        // ignore persistence failures
      }
      set({ scale: next, zoom: SCALE_VALUE[next] })
    },
  }
})

export { SCALE_VALUE, SCALE_LABEL }
