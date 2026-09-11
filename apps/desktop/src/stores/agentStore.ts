/**
 * Agent store - renderer state for the multi-agent system.
 *
 * Agents run in the Electron main process; this store holds templates,
 * instance views and the live event stream forwarded over IPC.
 */

import { create } from 'zustand'

export interface AgentTemplateView {
  id: string
  name: string
  description: string
  icon: string
  defaultIntervalMs: number
  defaultSymbols: string[]
  tools: string[]
}

export interface AgentMessageView {
  id: string
  at: number
  kind: string
  content: string
}

export interface AgentInstanceView {
  id: string
  templateId: string
  name: string
  icon: string
  status: 'idle' | 'running' | 'completed' | 'error' | 'stopped'
  mode: 'llm' | 'rule'
  symbols: string[]
  intervalMs: number
  createdAt: number
  lastRunAt: number | null
  lastMessage: string | null
  messages: AgentMessageView[]
}

export interface LlmConfig {
  baseUrl: string
  apiKey: string
  model: string
}

interface AgentState {
  templates: AgentTemplateView[]
  agents: AgentInstanceView[]
  mode: 'llm' | 'rule'
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  create: (args: { templateId: string; name?: string; symbols?: string[] }) => Promise<void>
  start: (id: string) => Promise<void>
  stop: (id: string) => Promise<void>
  remove: (id: string) => Promise<void>
  runOnce: (id: string) => Promise<void>
  setLlmConfig: (config: LlmConfig | null) => Promise<{ mode: 'llm' | 'rule' }>
  getLlmConfig: () => Promise<LlmConfig | null>
  applyEvent: (event: {
    type: string
    agentId: string
    content?: string
    message?: string
    status?: string
    at?: number
  }) => void
  clearError: () => void
}

const api = window.vibeAPI.agent

export const useAgentStore = create<AgentState>((set, get) => ({
  templates: [],
  agents: [],
  mode: 'rule',
  loading: false,
  error: null,

  refresh: async () => {
    set({ loading: true })
    try {
      const [templates, agents, mode] = await Promise.all([
        api.listTemplates(),
        api.list(),
        api.getMode(),
      ])
      set({ templates, agents, mode })
    } catch (e) {
      set({ error: (e as Error).message })
    } finally {
      set({ loading: false })
    }
  },

  create: async (args) => {
    await api.create(args)
    await get().refresh()
  },

  start: async (id) => {
    await api.start({ id })
    await get().refresh()
  },

  stop: async (id) => {
    await api.stop({ id })
    await get().refresh()
  },

  remove: async (id) => {
    await api.remove({ id })
    await get().refresh()
  },

  runOnce: async (id) => {
    await api.runOnce({ id })
    await get().refresh()
  },

  setLlmConfig: async (config) => {
    const result = await api.setLlmConfig(config)
    set({ mode: result.mode })
    await get().refresh()
    return result
  },

  getLlmConfig: () => api.getLlmConfig(),

  applyEvent: (event) => {
    const { agents } = get()
    const idx = agents.findIndex((a) => a.id === event.agentId)
    if (idx === -1) return
    const agent = agents[idx]!
    const next = { ...agent }
    if (event.type === 'status' && event.status) {
      next.status = event.status as AgentInstanceView['status']
    } else if (event.type === 'message' && event.content != null) {
      next.lastMessage = event.content
      next.messages = [
        ...next.messages,
        { id: `evt_${Date.now()}_${next.messages.length}`, at: event.at ?? Date.now(), kind: 'message', content: event.content },
      ].slice(-60)
    } else if (event.type === 'step' && event.content != null) {
      next.messages = [
        ...next.messages,
        { id: `evt_${Date.now()}_${next.messages.length}`, at: event.at ?? Date.now(), kind: 'step', content: event.content },
      ].slice(-60)
    } else if (event.type === 'error' && event.message != null) {
      next.messages = [
        ...next.messages,
        { id: `evt_${Date.now()}_${next.messages.length}`, at: event.at ?? Date.now(), kind: 'error', content: event.message },
      ].slice(-60)
    }
    const updated = [...agents]
    updated[idx] = next
    set({ agents: updated })
  },

  clearError: () => set({ error: null }),
}))
