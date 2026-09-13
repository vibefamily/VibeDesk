/**
 * Trade execution tools (the "trade-execute" skill).
 *
 * These tools let an agent execute real swaps on Arc through the
 * TradeExecutor bridge injected by the desktop main process. The bridge
 * keeps private keys inside the vault: it signs with the in-memory
 * authorized key of the wallet the user granted to this agent, and only
 * the transaction hash / balances ever come back to the agent.
 */

import type { ToolDefinition } from '../runtime/types'

/** Executor injected by the host (Electron main). Never exposes secrets. */
export interface TradeExecutor {
  /** Resolve a symbol ('BTC', 'ETH') or raw address to a token address. */
  resolveToken(symbol: string): Promise<string>
  /** Get a quote for amountIn of `token` (buy=true means token -> USDC). */
  getQuote(
    token: string,
    amountIn: string,
    buy: boolean,
  ): Promise<{ amountOut: string; decimals: number; price: string }>
  /** Execute a swap on Arc. Returns tx hash + explorer URL. */
  executeSwap(args: {
    walletId: string
    index?: number
    token: string
    amountIn: string
    buy: boolean
    amountOutMinimum: string
  }): Promise<{ hash: string; explorerUrl: string }>
  /** Wait for a tx receipt and return its status. */
  waitReceipt(hash: string): Promise<{ status: string; explorerUrl: string }>
  /** Balances of a wallet account: native USDC + token amount. */
  getBalances(
    walletId: string,
    index: number | undefined,
    token: string,
  ): Promise<{ nativeUsdc: string; token: string }>
}

/** Create the trade-execute toolset bound to a host executor. */
export function createTradeTools(executor: TradeExecutor): ToolDefinition[] {
  return [
    {
      name: 'get_swap_quote',
      description:
        "Get a swap quote on Arc: how much you receive for a given amount. token can be 'BTC', 'ETH' or a raw token address; amount is in base units (e.g. 0.01 for 0.01 BTC); buy=true means buying the token with USDC, buy=false means selling it for USDC.",
      parameters: {
        type: 'object',
        properties: {
          token: { type: 'string', description: "Symbol ('BTC'/'ETH') or token address" },
          amount: { type: 'string', description: 'Amount in base units, e.g. 0.01' },
          buy: { type: 'boolean', description: 'true = buy token with USDC, false = sell for USDC' },
        },
        required: ['token', 'amount', 'buy'],
      },
      execute: async (args) => {
        const token = String(args.token ?? '')
        const amount = String(args.amount ?? '0')
        const buy = args.buy === true || String(args.buy) === 'true'
        try {
          const resolved = await executor.resolveToken(token)
          const amountIn = BigInt(Math.round(Number(amount) * 10 ** 18)).toString()
          const q = await executor.getQuote(resolved, amountIn, buy)
          const out = (Number(q.amountOut) / 10 ** q.decimals).toFixed(6)
          return {
            success: true,
            content: `Quote: ${buy ? 'buy' : 'sell'} ${amount} ${token} (token ${resolved}) -> ${out} USDC (price ${q.price})`,
            data: { token, amountOut: out, price: q.price },
          }
        } catch (e) {
          return { success: false, content: `Quote failed: ${(e as Error).message}` }
        }
      },
    },
    {
      name: 'execute_swap',
      description:
        'Execute a real swap on Arc for an authorized wallet. First call list_authorized_wallets to pick a walletId. token can be BTC/ETH or an address; amount is in base units; buy=true buys the token with USDC. Requires the wallet to be unlocked and granted to this agent in Wallet Manager.',
      parameters: {
        type: 'object',
        properties: {
          walletId: { type: 'string', description: 'Authorized wallet id' },
          index: { type: 'number', description: 'HD account index (optional)' },
          token: { type: 'string', description: "Symbol ('BTC'/'ETH') or token address" },
          amount: { type: 'string', description: 'Amount in base units, e.g. 0.01' },
          buy: { type: 'boolean', description: 'true = buy token with USDC, false = sell for USDC' },
        },
        required: ['walletId', 'token', 'amount', 'buy'],
      },
      execute: async (args) => {
        const walletId = String(args.walletId ?? '')
        const index = args.index === undefined ? undefined : Number(args.index)
        const token = String(args.token ?? '')
        const amount = String(args.amount ?? '0')
        const buy = args.buy === true || String(args.buy) === 'true'
        try {
          const resolved = await executor.resolveToken(token)
          const amountIn = BigInt(Math.round(Number(amount) * 10 ** 18)).toString()
          const q = await executor.getQuote(resolved, amountIn, buy)
          // 2.5% slippage buffer.
          const minOut = (BigInt(q.amountOut) * 9750n) / 10000n
          const res = await executor.executeSwap({
            walletId,
            index,
            token: resolved,
            amountIn,
            buy,
            amountOutMinimum: minOut.toString(),
          })
          const receipt = await executor.waitReceipt(res.hash)
          return {
            success: true,
            content: `Swap executed: ${buy ? 'bought' : 'sold'} ${amount} ${token} (tx ${res.hash}, status ${receipt.status}). Explorer: ${receipt.explorerUrl}`,
            data: { hash: res.hash, status: receipt.status, explorerUrl: receipt.explorerUrl },
          }
        } catch (e) {
          return { success: false, content: `Swap failed: ${(e as Error).message}` }
        }
      },
    },
    {
      name: 'get_agent_balances',
      description:
        'Get the USDC and token balances of an authorized wallet account on Arc. token can be BTC/ETH or an address.',
      parameters: {
        type: 'object',
        properties: {
          walletId: { type: 'string', description: 'Authorized wallet id' },
          index: { type: 'number', description: 'HD account index (optional)' },
          token: { type: 'string', description: "Symbol ('BTC'/'ETH') or token address (optional, defaults to the demo token)" },
        },
        required: ['walletId'],
      },
      execute: async (args) => {
        const walletId = String(args.walletId ?? '')
        const index = args.index === undefined ? undefined : Number(args.index)
        const token = String(args.token ?? 'BTC')
        try {
          const resolved = await executor.resolveToken(token)
          const b = await executor.getBalances(walletId, index, resolved)
          return {
            success: true,
            content: `Balances: ${b.nativeUsdc} USDC, ${b.token} token`,
            data: b,
          }
        } catch (e) {
          return { success: false, content: `Balances failed: ${(e as Error).message}` }
        }
      },
    },
  ]
}
