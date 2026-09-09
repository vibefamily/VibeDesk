/**
 * WalletManager - manages wallets across multiple chains.
 *
 * Wallets are stored securely with the system keychain / encrypted local storage.
 * The manager routes operations to the correct chain-specific wallet provider.
 */

import type { ChainInfo, WalletInfo } from '@vibe/shared'
import type { IWalletManager, IWalletProvider, ImportWalletOptions } from './types'

export class WalletManager implements IWalletManager {
  private providers = new Map<string, IWalletProvider>()
  // In-memory wallet registry (in production, persist to encrypted storage)
  private wallets = new Map<string, WalletInfo>()

  registerProvider(provider: IWalletProvider): void {
    this.providers.set(provider.chain, provider)
  }

  getProvider(chain: string): IWalletProvider | undefined {
    return this.providers.get(chain)
  }

  async createWallet(chain: string, name: string): Promise<WalletInfo> {
    const provider = this.providers.get(chain)
    if (!provider) throw new Error(`No wallet provider for chain '${chain}'`)
    const wallet = await provider.createWallet(name)
    this.wallets.set(wallet.id, wallet)
    return wallet
  }

  async importWallet(chain: string, options: ImportWalletOptions): Promise<WalletInfo> {
    const provider = this.providers.get(chain)
    if (!provider) throw new Error(`No wallet provider for chain '${chain}'`)
    const wallet = await provider.importWallet(options)
    this.wallets.set(wallet.id, wallet)
    return wallet
  }

  async listWallets(chain?: string): Promise<WalletInfo[]> {
    const all = Array.from(this.wallets.values())
    if (chain) return all.filter((w) => w.chain === chain)
    return all
  }

  async removeWallet(id: string): Promise<void> {
    const wallet = this.wallets.get(id)
    if (!wallet) return
    const provider = this.providers.get(wallet.chain)
    if (provider) {
      await provider.removeWallet(id)
    }
    this.wallets.delete(id)
  }

  getSupportedChains(): ChainInfo[] {
    return Array.from(this.providers.values()).map((p) => p.chainInfo)
  }
}
