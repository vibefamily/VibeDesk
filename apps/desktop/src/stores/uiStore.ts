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
  nativeTitleBar: boolean
  setScale: (scale: UiScale) => void
  setNativeTitleBar: (on: boolean) => Promise<void>
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

const NATIVE_TITLEBAR_KEY = 'vibedesk.nativeTitleBar'

function loadNativeTitleBar(): boolean {
  try {
    const v = localStorage.getItem(NATIVE_TITLEBAR_KEY)
    // Default to the native OS title bar (most robust window controls);
    // the immersive 95-style edge-to-edge mode stays available.
    return v === null ? true : v === '1'
  } catch {
    return true
  }
}

export const useUiStore = create<UiState>((set) => {
  const scale = loadSaved()
  return {
    scale,
    zoom: SCALE_VALUE[scale],
    nativeTitleBar: loadNativeTitleBar(),
    setScale: (next) => {
      try {
        localStorage.setItem(KEY, next)
      } catch {
        // ignore persistence failures
      }
      set({ scale: next, zoom: SCALE_VALUE[next] })
    },
    setNativeTitleBar: async (on) => {
      try {
        localStorage.setItem(NATIVE_TITLEBAR_KEY, on ? '1' : '0')
      } catch {
        // ignore persistence failures
      }
      set({ nativeTitleBar: on })
      // Tell the main process to switch the native title bar at runtime.
      try {
        await window.vibeAPI.setTitleBarStyle(on ? 'default' : 'hiddenInset')
      } catch {
        // non-macOS: runtime switching is not supported; the stored
        // preference still applies on next launch
      }
    },
  }
})

export { SCALE_VALUE, SCALE_LABEL }
