/**
 * Window store - desktop window manager state (React95 style).
 *
 * Tracks open windows (component key, position, size, z-order,
 * minimized/maximized). Mirrors the classic Windows 95 desktop model.
 */

import { create } from 'zustand'
import { useUiStore } from '../../stores/uiStore'

export interface WindowState {
  id: string
  /** Component key resolved by WindowManager, e.g. 'stock-tokens' */
  component: string
  title: string
  icon: string
  x: number
  y: number
  width: number
  height: number
  isMinimized: boolean
  isMaximized: boolean
  zIndex: number
  originalX: number
  originalY: number
  originalWidth: number
  originalHeight: number
}

export interface ChatIntent {
  /** When set, act on an existing agent session instead of creating one. */
  agentId?: string
  templateId: string
  title?: string
  symbols?: string[]
  question?: string
}

interface WindowStore {
  windows: WindowState[]
  nextZIndex: number
  addWindow: (win: {
    component: string
    title: string
    icon: string
    x: number
    y: number
    width: number
    height: number
  }) => void
  removeWindow: (id: string) => void
  minimizeWindow: (id: string) => void
  toggleMaximize: (id: string) => void
  restoreWindow: (id: string) => void
  focusWindow: (id: string) => void
  updateWindowPosition: (id: string, x: number, y: number) => void
  updateWindowSize: (id: string, width: number, height: number) => void
  openWindow: (
    component: string,
    title: string,
    icon: string,
    opts?: { width?: number; height?: number },
  ) => void
  openChatWindow: (agentId: string, title: string, icon: string) => void
  chatIntent: ChatIntent | null
  setChatIntent: (intent: ChatIntent) => void
  consumeChatIntent: () => void
}

let windowSeq = 0

export const useWindowStore = create<WindowStore>((set) => ({
  windows: [],
  nextZIndex: 1,

  addWindow: (win) =>
    set((state) => {
      const id = `win-${Date.now()}-${windowSeq++}`
      return {
        windows: [
          ...state.windows,
          {
            ...win,
            id,
            isMinimized: false,
            isMaximized: false,
            // Baseline above the desktop drag strip (zIndex 50): windows
            // must always sit on top of it, otherwise a maximized window's
            // title bar is covered and its buttons are unreachable.
            // NOTE: keep every write site consistent with focusWindow's
            // "100 +" offset - mixing them makes new windows sit below
            // already-focused ones.
            zIndex: 100 + state.nextZIndex,
            originalX: win.x,
            originalY: win.y,
            originalWidth: win.width,
            originalHeight: win.height,
          },
        ],
        nextZIndex: state.nextZIndex + 1,
      }
    }),

  removeWindow: (id) =>
    set((state) => ({
      windows: state.windows.filter((w) => w.id !== id),
    })),

  minimizeWindow: (id) =>
    set((state) => ({
      windows: state.windows.map((w) => (w.id === id ? { ...w, isMinimized: true } : w)),
    })),

  toggleMaximize: (id) =>
    set((state) => {
      const win = state.windows.find((w) => w.id === id)
      if (!win) return state
      const willMaximize = !win.isMaximized
      return {
        windows: state.windows.map((w) =>
          w.id === id
            ? {
                ...w,
                isMaximized: willMaximize,
                originalX: willMaximize ? w.x : w.originalX,
                originalY: willMaximize ? w.y : w.originalY,
                originalWidth: willMaximize ? w.width : w.originalWidth,
                originalHeight: willMaximize ? w.height : w.originalHeight,
                // Keep the same "100 +" baseline as every other write site:
                // a bare nextZIndex would drop a maximized window below
                // regular windows (and below the drag strip).
                zIndex: 100 + state.nextZIndex,
              }
            : w,
        ),
        nextZIndex: state.nextZIndex + 1,
      }
    }),

  restoreWindow: (id) =>
    set((state) => ({
      windows: state.windows.map((w) =>
        w.id === id ? { ...w, isMinimized: false, zIndex: 100 + state.nextZIndex } : w,
      ),
      nextZIndex: state.nextZIndex + 1,
    })),

  focusWindow: (id) =>
    set((state) => ({
      windows: state.windows.map((w) =>
        w.id === id ? { ...w, zIndex: 100 + state.nextZIndex } : w,
      ),
      nextZIndex: state.nextZIndex + 1,
    })),

  updateWindowPosition: (id, x, y) =>
    set((state) => ({
      windows: state.windows.map((w) => (w.id === id ? { ...w, x, y } : w)),
    })),

  updateWindowSize: (id, width, height) =>
    set((state) => ({
      windows: state.windows.map((w) => (w.id === id ? { ...w, width, height } : w)),
    })),

  openWindow: (component, title, icon, opts) => {
    const { windows, nextZIndex } = useWindowStore.getState()
    // Bring an already-open window to front instead of duplicating it.
    const existing = windows.find((w) => w.component === component)
    if (existing) {
      set((state) => ({
        windows: state.windows.map((w) =>
          w.id === existing.id
            ? { ...w, isMinimized: false, zIndex: 100 + state.nextZIndex }
            : w,
        ),
        nextZIndex: state.nextZIndex + 1,
      }))
      return
    }
    const vw = window.innerWidth
    const vh = window.innerHeight
    const w = opts?.width ?? 760
    const h = opts?.height ?? 520
    // The desktop container is scaled by the Interface Size zoom, so a
    // window's CSS coordinates are magnified visually. To make the
    // window land on the viewport center we must divide by zoom; the
    // position is relative to the icon area (36px from the top, 40px
    // above the taskbar).
    const zoom = useUiStore.getState().zoom
    const cascade = Math.min(windows.length * 14, 40)
    useWindowStore.getState().addWindow({
      component,
      title,
      icon,
      // x keeps a 150px left margin so a window never covers the
      // desktop icon column even if the viewport math is off.
      x: Math.max(150, Math.round(vw / (2 * zoom) - w / 2) + cascade),
      y: Math.max(8, Math.round(vh / (2 * zoom) - 36 - h / 2) + cascade),
      width: w,
      height: h,
    })
    void nextZIndex
  },

  openChatWindow: (agentId, title, icon) => {
    useWindowStore.getState().openWindow(`chat:${agentId}`, title, icon, {
      width: 680,
      height: 500,
    })
  },

  chatIntent: null,

  setChatIntent: (intent) => set({ chatIntent: intent }),

  consumeChatIntent: () => set({ chatIntent: null }),
}))
