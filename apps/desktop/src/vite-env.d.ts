/// <reference types="vite/client" />

/**
 * Type declarations for the Vite environment.
 */

interface ImportMetaEnv {
  readonly VITE_APP_TITLE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/**
 * Types for the preload-exposed API.
 * Keep in sync with electron/preload/index.ts
 */
interface VibeAPI {
  getAppInfo: () => Promise<{ version: string; name: string; platform: string }>
  ping: () => Promise<string>
  on: (channel: string, callback: (...args: unknown[]) => void) => void
}

interface Window {
  vibeAPI: VibeAPI
}
