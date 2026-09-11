/**
 * Market data store for the renderer.
 *
 * Data sources run in the Electron main process (Node fetch/WebSocket),
 * which avoids the browser CORS errors that public endpoints like
 * Robinhood and Yahoo trigger from the renderer. The main process polls
 * every tracked symbol and pushes live ticks here over 'market:ticks';
 * this store just holds the latest snapshot + provider manifests.
 */

import { create } from 'zustand'
import type { TickData } from '@vibe/shared'

/** Pure manifest data passed over IPC (no provider object). */
export interface ProviderManifestView {
  id: string
  name: string
  kind: string
  assetScope: string
  authRequired: boolean
  updateMode: string[]
  description: string
  privacyNote: string
}

interface MarketState {
  ready: boolean
  error: string | null
  manifests: ProviderManifestView[]
  /** symbol -> providerId -> latest tick */
  ticks: Record<string, Record<string, TickData>>
  /** providers that errored for a symbol (e.g. asset not listed) */
  unavailable: Record<string, string[]>
  loading: boolean
  lastUpdated: number | null
  init: () => Promise<void>
  refreshSymbol: (symbol: string) => Promise<void>
}

export const useMarketStore = create<MarketState>((set, get) => ({
  ready: false,
  error: null,
  manifests: [],
  ticks: {},
  unavailable: {},
  loading: false,
  lastUpdated: null,

  init: async () => {
    if (get().ready) {
      return
    }
    set({ loading: true })
    try {
      const state = await window.vibeAPI.market.getState()
      set({
        ready: state.ready,
        manifests: state.manifests,
        // IPC payloads mirror TickData structurally; cast through unknown.
        ticks: state.ticks as unknown as Record<string, Record<string, TickData>>,
        unavailable: state.unavailable,
        lastUpdated: state.lastUpdated,
      })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ loading: false })
    }
  },

  refreshSymbol: async (symbol) => {
    try {
      const raw = await window.vibeAPI.market.refreshSymbol(symbol)
      const snap = raw as unknown as {
        ticks: Record<string, Record<string, TickData>>
        unavailable: Record<string, string[]>
        lastUpdated: number
      }
      set((state) => ({
        ticks: { ...state.ticks, ...snap.ticks },
        unavailable: { ...state.unavailable, ...snap.unavailable },
        lastUpdated: snap.lastUpdated,
      }))
    } catch {
      // Silent; the polling loop will refresh the symbol soon.
    }
  },
}))

// Subscribe to live ticks pushed by the main process.
if (typeof window !== 'undefined' && window.vibeAPI) {
  window.vibeAPI.on('market:ticks', (payload) => {
    const snap = payload as unknown as {
      ticks: Record<string, Record<string, TickData>>
      unavailable: Record<string, string[]>
      lastUpdated: number
    }
    useMarketStore.setState((state) => ({
      ready: true,
      ticks: { ...state.ticks, ...snap.ticks },
      unavailable: { ...state.unavailable, ...snap.unavailable },
      lastUpdated: snap.lastUpdated,
    }))
  })
}
