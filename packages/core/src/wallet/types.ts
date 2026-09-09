/**
 * Wallet management interfaces.
 *
 * The wallet module handles creation, import, storage, and
 * signing for both CEX API keys and on-chain wallets.
 */

import type { ChainInfo, WalletInfo } from '@vibe/shared'

/** Wallet import options */
export interface ImportWalletOptions {
  name: string
  chain: string
  type: 'mnemonic' | 'private_key' | 'watch_only'
  /** Mnemonic phrase (for mnemonic type) */
  mnemonic?: string
  /** Derivation path (e.g., m/44'/60'/0'/0/0) */
  derivationPath?: string
  /** Private key hex string */
  privateKey?: string
  /** Wallet address (for watch-only) */
  address?: string
}

/**
 * Wallet provider interface.
 *
 * Each chain / wallet type implements this interface.
 */
export interface IWalletProvider {
  readonly chain: string
  readonly chainInfo: ChainInfo

  /** Create a new wallet */
  createWallet(name: string): Promise<WalletInfo>

  /** Import an existing wallet */
  importWallet(options: ImportWalletOptions): Promise<WalletInfo>

  /** Get wallet by ID */
  getWallet(id: string): Promise<WalletInfo | null>

  /** List all wallets for this chain */
  listWallets(): Promise<WalletInfo[]>

  /** Remove a wallet */
  removeWallet(id: string): Promise<void>

  /** Sign a transaction (returns signed tx data) */
  signTransaction(walletId: string, txData: unknown): Promise<string>

  /** Sign a message */
  signMessage(walletId: string, message: string): Promise<string>

  /** Get native token balance */
  getBalance(walletId: string): Promise<number>
}

/**
 * Wallet manager - manages wallets across multiple chains.
 */
export interface IWalletManager {
  registerProvider(provider: IWalletProvider): void
  getProvider(chain: string): IWalletProvider | undefined

  createWallet(chain: string, name: string): Promise<WalletInfo>
  importWallet(chain: string, options: ImportWalletOptions): Promise<WalletInfo>
  listWallets(chain?: string): Promise<WalletInfo[]>
  removeWallet(id: string): Promise<void>

  /** Get all supported chains */
  getSupportedChains(): ChainInfo[]
}
