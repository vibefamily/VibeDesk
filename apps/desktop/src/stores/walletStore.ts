/**
 * Wallet store - renderer-side state for the wallet vault.
 *
 * All secret operations are delegated to the main process over IPC;
 * this store only holds address-level metadata and authorization status.
 */

import { create } from 'zustand'
import type { WalletMeta } from '@vibe/core'

export interface WalletState {
  unlocked: boolean
  empty: boolean
  wallets: WalletMeta[]
  authorized: string[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  unlock: (password: string) => Promise<void>
  lock: () => Promise<void>
  createHd: (args: {
    name: string
    password: string
    passphrase?: string
    accountCount?: number
  }) => Promise<{ mnemonic: string; wallet: WalletMeta }>
  importHd: (args: {
    name: string
    mnemonic: string
    password: string
    passphrase?: string
    accountCount?: number
  }) => Promise<{ mnemonic: string; wallet: WalletMeta }>
  importPrivateKey: (args: {
    name: string
    privateKey: string
    password: string
  }) => Promise<WalletMeta>
  importKeystore: (args: {
    name: string
    keystoreJson: string
    keystorePassword: string
    password: string
  }) => Promise<WalletMeta>
  deriveMore: (args: {
    hdWalletId: string
    count: number
    password: string
  }) => Promise<void>
  exportMnemonic: (args: {
    walletId: string
    password: string
  }) => Promise<string>
  exportPrivateKey: (args: {
    walletId: string
    password: string
    index?: number
  }) => Promise<string>
  exportKeystore: (args: {
    walletId: string
    password: string
  }) => Promise<Record<string, unknown>>
  authorizeAgent: (args: {
    walletId: string
    password: string
    index?: number
  }) => Promise<void>
  revokeAgent: (args: { walletId: string; index?: number }) => Promise<void>
  revokeAll: () => Promise<void>
  remove: (walletId: string) => Promise<void>
  clearError: () => void
}

const api = window.vibeAPI.wallet

export const useWalletStore = create<WalletState>((set, get) => ({
  unlocked: false,
  empty: true,
  wallets: [],
  authorized: [],
  loading: false,
  error: null,

  refresh: async () => {
    set({ loading: true })
    try {
      const state = await api.getState()
      set({
        unlocked: state.unlocked,
        empty: state.empty,
        wallets: state.wallets,
        authorized: state.authorized,
      })
    } catch (e) {
      set({ error: (e as Error).message })
    } finally {
      set({ loading: false })
    }
  },

  unlock: async (password) => {
    await api.unlock(password)
    await get().refresh()
  },

  lock: async () => {
    await api.lock()
    await get().refresh()
  },

  createHd: async (args) => {
    const result = await api.createHd(args)
    await get().refresh()
    return result
  },

  importHd: async (args) => {
    const result = await api.importHd(args)
    await get().refresh()
    return result
  },

  importPrivateKey: async (args) => {
    const result = await api.importPrivateKey(args)
    await get().refresh()
    return result
  },

  importKeystore: async (args) => {
    const result = await api.importKeystore(args)
    await get().refresh()
    return result
  },

  deriveMore: async (args) => {
    await api.deriveMore(args)
    await get().refresh()
  },

  exportMnemonic: (args) => api.exportMnemonic(args),
  exportPrivateKey: (args) => api.exportPrivateKey(args),
  exportKeystore: (args) => api.exportKeystore(args),

  authorizeAgent: async (args) => {
    const result = await api.authorizeAgent(args)
    set({ authorized: result.authorized })
  },

  revokeAgent: async (args) => {
    const result = await api.revokeAgent(args)
    set({ authorized: result.authorized })
  },

  revokeAll: async () => {
    const result = await api.revokeAll()
    set({ authorized: result.authorized })
  },

  remove: async (walletId) => {
    const result = await api.remove({ walletId })
    set({ wallets: result.wallets })
  },

  clearError: () => set({ error: null }),
}))
