/**
 * Renderer-side wallet types.
 *
 * These mirror the shapes returned by the main process over IPC. They are
 * deliberately defined locally instead of importing from @vibe/core so the
 * renderer bundle never pulls in node:fs-based wallet code.
 */

/** A derived account attached to an HD wallet. */
export interface HdAccountMeta {
  index: number
  name: string
  address: string
}

/** Address-level wallet metadata (no secrets). */
export interface WalletMeta {
  id: string
  name: string
  chain: string
  address: string
  kind: 'hd' | 'private_key'
  /** For HD wallets: all derived accounts (address-level only) */
  accounts?: HdAccountMeta[]
  canSign: boolean
  createdAt: number
}
