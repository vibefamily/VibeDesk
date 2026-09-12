/**
 * Skill store - renderer state for configurable capability packages.
 *
 * Skills live in the main process (keys never reach the renderer values);
 * this store holds the registry view + save/test actions.
 */

import { create } from 'zustand'

export interface SkillFieldView {
  key: string
  label: string
  secret: boolean
  placeholder?: string
}

export interface SkillView {
  id: string
  name: string
  description: string
  icon: string
  kind: 'data-source' | 'tool-set'
  authRequired: boolean
  configuredKeys: string[]
  configFields: SkillFieldView[]
}

interface SkillState {
  skills: SkillView[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  saveConfig: (skillId: string, config: Record<string, string>) => Promise<{ requiresRestart: boolean }>
  testConnection: (skillId: string, config: Record<string, string>) => Promise<{ ok: boolean; message: string }>
}

const api = window.vibeAPI.skills

export const useSkillStore = create<SkillState>((set, get) => ({
  skills: [],
  loading: false,
  error: null,

  refresh: async () => {
    set({ loading: true })
    try {
      const skills = await api.list()
      set({ skills })
    } catch (e) {
      set({ error: (e as Error).message })
    } finally {
      set({ loading: false })
    }
  },

  saveConfig: async (skillId, config) => {
    const result = await api.saveConfig({ skillId, config })
    await get().refresh()
    return result
  },

  testConnection: (skillId, config) => api.testConnection({ skillId, config }),
}))
