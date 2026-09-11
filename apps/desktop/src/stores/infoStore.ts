/**
 * Info Center store (M3) - IPC wrapper + live subscription.
 */

import { create } from 'zustand'
import type {
  InfoSourceConfig,
  InfoState,
  InfoSearchQuery,
  InfoItem,
} from '@vibe/shared'

interface InfoStoreState extends InfoState {
  loading: boolean
  error: string | null
  init: () => Promise<void>
  upsertSource: (input: Partial<InfoSourceConfig> & { id?: string }) => Promise<void>
  deleteSource: (id: string) => Promise<void>
  refreshNow: (id?: string) => Promise<void>
  search: (query: InfoSearchQuery) => Promise<InfoItem[]>
}

const initial: InfoState = { sources: [], statuses: {}, items: [] }

export const useInfoStore = create<InfoStoreState>((set, get) => ({
  ...initial,
  loading: false,
  error: null,

  init: async () => {
    set({ loading: true })
    try {
      const state = await window.vibeAPI.info.getState()
      set({ ...state, loading: false, error: null })
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) })
    }
  },

  upsertSource: async (input) => {
    try {
      const state = await window.vibeAPI.info.upsertSource(input)
      set({ ...state, error: null })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  deleteSource: async (id) => {
    try {
      const state = await window.vibeAPI.info.deleteSource(id)
      set({ ...state, error: null })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  refreshNow: async (id) => {
    try {
      const state = await window.vibeAPI.info.refreshNow(id)
      set({ ...state, error: null })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  search: (query) => window.vibeAPI.info.search(query),
}))

// Live updates pushed by the main process after every pull.
window.vibeAPI.on('info:event', (payload) => {
  const snap = payload as unknown as InfoState
  if (snap && Array.isArray(snap.sources)) {
    useInfoStore.setState({ ...snap })
  }
})
