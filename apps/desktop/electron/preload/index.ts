/**
 * Electron preload script.
 *
 * Exposes a safe, limited API to the renderer process via contextBridge.
 * All IPC communication goes through this layer.
 */

import { contextBridge, ipcRenderer } from 'electron'

/**
 * API exposed to the renderer process.
 * Keep this minimal and well-typed for security.
 */
const vibeAPI = {
  // App info
  getAppInfo: () => ipcRenderer.invoke('app:getInfo'),
  ping: () => ipcRenderer.invoke('app:ping'),

  // Event listeners
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    const validChannels = ['market:tick', 'order:update', 'agent:proposal']
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args))
    }
  },
}

contextBridge.exposeInMainWorld('vibeAPI', vibeAPI)

export type VibeAPI = typeof vibeAPI
