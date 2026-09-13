/**
 * ARC Testnet IPC surface (main process).
 *
 * quote/swap/balance bridge to the renderer. Swaps require a vault
 * wallet that has been unlocked AND authorized to the agent in memory
 * (wallet:authorizeAgent) - the private key is pulled from the vault's
 * in-memory cache and never crosses the IPC boundary.
 */

import { ipcMain } from 'electron'
import {
  arcQuote,
  arcSwap,
  arcBalances,
  arcWaitReceipt,
  setArcNetwork,
  getArcNetwork,
  isArcMainnetReady,
  getArcNetworkConfig,
} from './arc'
import type { VaultWalletManager } from '@vibe/core/wallet'

export interface ArcIpcDeps {
  getWalletManager: () => VaultWalletManager
}

export function setupArcIpc({ getWalletManager }: ArcIpcDeps): void {
  // Network switching (testnet verified / mainnet placeholders).
  ipcMain.handle('arc:getNetwork', () => {
    const cfg = getArcNetworkConfig()
    return {
      network: getArcNetwork(),
      name: cfg.name,
      chainId: cfg.chainId,
      mainnetReady: isArcMainnetReady(),
    }
  })

  ipcMain.handle('arc:setNetwork', async (_e, network: string) => {
    if (network !== 'testnet' && network !== 'mainnet') {
      throw new Error(`Unknown Arc network: ${network}`)
    }
    setArcNetwork(network)
    const cfg = getArcNetworkConfig()
    return {
      network: getArcNetwork(),
      name: cfg.name,
      chainId: cfg.chainId,
      mainnetReady: isArcMainnetReady(),
    }
  })

  ipcMain.handle('arc:quote', async (_e, args: { token: string; zeroForOne: boolean; amountIn: string; hooks?: string }) => {
    const { amountOut, decimals } = await arcQuote({
      token: args.token,
      zeroForOne: args.zeroForOne,
      amountIn: BigInt(args.amountIn ?? '0'),
      hooks: args.hooks as `0x${string}` | undefined,
    })
    return { amountOut: amountOut.toString(), decimals }
  })

  ipcMain.handle('arc:balances', async (_e, args: { walletId: string; index?: number; token: string }) => {
    // Balances are public on-chain data - only the wallet address is
    // needed, so no unlock/auth is required here (signing still is).
    const vault = getWalletManager()
    const wallet = vault.getWallet(args.walletId)
    if (!wallet) throw new Error('Wallet not found')
    let address: `0x${string}`
    if (wallet.kind === 'hd') {
      const acc = (wallet.accounts ?? []).find(
        (a) => String(a.index) === String(args.index ?? 0),
      )
      if (!acc) throw new Error('HD account not found')
      address = acc.address as `0x${string}`
    } else {
      address = wallet.address as `0x${string}`
    }
    return arcBalances(address, args.token)
  })

  ipcMain.handle(
    'arc:swap',
    async (
      _e,
      args: {
        walletId: string
        index?: number
        token: string
        zeroForOne: boolean
        amountIn: string
        amountOutMinimum: string
        hooks?: string
      },
    ) => {
      const vault = getWalletManager()
      const privateKey = vault.getAuthorizedKey(args.walletId, args.index)
      if (!privateKey) {
        throw new Error('Wallet is not unlocked/authorized for trading - unlock the vault and grant this wallet in Wallet Manager')
      }
      const { hash } = await arcSwap({
        privateKey,
        token: args.token,
        zeroForOne: args.zeroForOne,
        amountIn: BigInt(args.amountIn ?? '0'),
        amountOutMinimum: BigInt(args.amountOutMinimum ?? '0'),
        hooks: args.hooks as `0x${string}` | undefined,
      })
      return { hash }
    },
  )

  ipcMain.handle('arc:waitReceipt', async (_e, hash: string) => {
    return arcWaitReceipt(hash)
  })
}
