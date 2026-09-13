/**
 * ARC on-chain module (main process).
 *
 * Live Uniswap v4 swaps on Arc (gas = native USDC) through the
 * Minara-deployed Universal Router. Flow:
 *
 *   quote  ->  approve (sell only, Permit2)  ->  swap  ->  tx hash
 *
 * Private keys come from the wallet vault's in-memory agent
 * authorization (getAuthorizedKey) and never leave the main process.
 * Chain/contract config lives in arc/networks.ts (testnet verified,
 * mainnet placeholders); call setArcNetwork() to switch.
 */

import { createPublicClient, createWalletClient, http, defineChain, formatUnits } from 'viem'
import type { Abi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { encodeAbiParameters, encodeFunctionData, keccak256, parseAbiParameters } from 'viem'
import {
  ARC_NETWORKS,
  type ArcNetworkConfig,
  type ArcNetworkId,
} from './arc/networks'

// --- Network state ----------------------------------------------------------

let currentNetwork: ArcNetworkId = 'testnet'

/** Switch the active Arc network (testnet/mainnet). Rebuilds clients. */
export function setArcNetwork(id: ArcNetworkId): void {
  if (!ARC_NETWORKS[id]) throw new Error(`Unknown Arc network: ${id}`)
  const cfg = ARC_NETWORKS[id]
  if (!cfg.rpcUrl || !cfg.uniswap.v4Quoter) {
    throw new Error(`Arc ${cfg.name} is not configured yet (placeholder addresses).`)
  }
  currentNetwork = id
  cachedPublicClient = null
  cachedChain = null
}

export function getArcNetwork(): ArcNetworkId {
  return currentNetwork
}

export function getArcNetworkConfig(): ArcNetworkConfig {
  return ARC_NETWORKS[currentNetwork]
}

export function isArcMainnetReady(): boolean {
  const cfg = ARC_NETWORKS.mainnet
  return Boolean(cfg.rpcUrl && cfg.uniswap.v4Quoter)
}

// --- Chain ------------------------------------------------------------------

let cachedChain: ReturnType<typeof defineChain> | null = null
function chain(): ReturnType<typeof defineChain> {
  if (cachedChain) return cachedChain
  const cfg = ARC_NETWORKS[currentNetwork]
  cachedChain = defineChain({
    id: cfg.chainId,
    name: cfg.name,
    nativeCurrency: { name: cfg.nativeSymbol, symbol: cfg.nativeSymbol, decimals: cfg.nativeDecimals },
    rpcUrls: { default: { http: [cfg.rpcUrl] } },
    blockExplorers: { default: { name: 'Arcscan', url: cfg.explorerBase } },
  })
  return cachedChain
}

export function arcExplorerTx(hash: string): string {
  return `${ARC_NETWORKS[currentNetwork].explorerBase}/tx/${hash}`
}

export const ARC_EXPLORER_TX = 'https://testnet.arcscan.app/tx/'

// --- Minara Uniswap v4 contracts (per active network) -----------------------

export const ARC_CONTRACTS = (): ArcNetworkConfig['uniswap'] => ARC_NETWORKS[currentNetwork].uniswap

/** Native USDC placeholder used as currency0 in Minara pools. */
export const NATIVE_USDC = '0x0000000000000000000000000000000000000000' as `0x${string}`

/** Minara fee hook (single instance) - every launched pool uses it. */
export const MINARA_FEE_HOOK = '0xA6CcB619818b822E683B16bd5eb041970e6ce0CC' as `0x${string}`

// --- Clients ----------------------------------------------------------------

// viem 2.56's generic inference is unreliable for contract calls in this
// monorepo's TS setup; the clients below keep the exact viem runtime API
// with explicit loose types (runtime behavior is unchanged and verified).
interface LoosePublicClient {
  getBalance: (args: { address: `0x${string}` }) => Promise<bigint>
  readContract: (args: { address: `0x${string}`; abi: unknown; functionName: string; args: unknown[] }) => Promise<unknown>
  call: (args: { to: `0x${string}`; data: `0x${string}` }) => Promise<{ data: `0x${string}` }>
  waitForTransactionReceipt: (args: { hash: `0x${string}` }) => Promise<{ status: string }>
  simulateContract: (args: {
    address: `0x${string}`
    abi: unknown
    functionName: string
    args: unknown[]
  }) => Promise<{ result: unknown[] }>
}

let cachedPublicClient: LoosePublicClient | null = null
function publicClient(): LoosePublicClient {
  if (!cachedPublicClient) {
    cachedPublicClient = createPublicClient({ chain: chain(), transport: http() }) as unknown as LoosePublicClient
  }
  return cachedPublicClient
}

// --- ABI fragments ----------------------------------------------------------

const quoterAbi = [
  {
    type: 'function',
    name: 'quoteExactInputSingle',
    stateMutability: 'view',
    inputs: [
      {
        type: 'tuple',
        components: [
          {
            type: 'tuple',
            components: [
              { type: 'address', name: 'currency0' },
              { type: 'address', name: 'currency1' },
              { type: 'uint24', name: 'fee' },
              { type: 'int24', name: 'tickSpacing' },
              { type: 'address', name: 'hooks' },
            ],
            name: 'poolKey',
          },
          { type: 'bool', name: 'zeroForOne' },
          { type: 'uint128', name: 'exactAmount' },
          { type: 'bytes', name: 'hookData' },
        ],
        name: 'params',
      },
    ],
    outputs: [
      { type: 'uint256', name: 'amountOut' },
      { type: 'uint256', name: 'gasEstimate' },
    ],
  },
] as const

const routerAbi = [
  {
    type: 'function',
    name: 'execute',
    stateMutability: 'payable',
    inputs: [
      { type: 'bytes', name: 'commands' },
      { type: 'bytes[]', name: 'inputs' },
      { type: 'uint256', name: 'deadline' },
    ],
    outputs: [],
  },
] as const

const erc20DecimalsAbi = [
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint8' }],
  },
] as const

const erc20Abi = [
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { type: 'address', name: 'owner' },
      { type: 'address', name: 'spender' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { type: 'address', name: 'spender' },
      { type: 'uint256', name: 'amount' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ type: 'address', name: 'owner' }],
    outputs: [{ type: 'uint256' }],
  },
] as const

const permit2AllowanceAbi = [
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { type: 'address', name: 'owner' },
      { type: 'address', name: 'token' },
      { type: 'address', name: 'spender' },
    ],
    outputs: [
      { type: 'uint160', name: 'amount' },
      { type: 'uint48', name: 'expiration' },
      { type: 'uint48', name: 'nonce' },
    ],
  },
] as const
const permit2ApproveAbi = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { type: 'address', name: 'token' },
      { type: 'address', name: 'spender' },
      { type: 'uint160', name: 'amount' },
      { type: 'uint48', name: 'expiration' },
    ],
    outputs: [],
  },
] as const

// --- Pool key helpers -------------------------------------------------------

export interface ArcPoolKey {
  currency0: `0x${string}`
  currency1: `0x${string}`
  fee: number
  tickSpacing: number
  hooks: `0x${string}`
}

/**
 * Minara launches pool with native USDC as currency0, the token as
 * currency1, fee 2500 (0.25%), tick spacing 25 and the pool's hook
 * (zero address for pre-hook pools; pass the token's actual hook when
 * known). TokenLaunched.key is authoritative on-chain.
 */
export function poolKeyFor(token: string, hooks: `0x${string}` = MINARA_FEE_HOOK): ArcPoolKey {
  return {
    currency0: NATIVE_USDC,
    currency1: token as `0x${string}`,
    fee: 2500,
    tickSpacing: 25,
    hooks,
  }
}

export function poolIdFor(token: string, hooks: `0x${string}` = MINARA_FEE_HOOK): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      parseAbiParameters('(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks)'),
      [poolKeyFor(token, hooks)],
    ),
  )
}

// --- Quote ------------------------------------------------------------------

export interface ArcQuoteParams {
  token: string
  /** zeroForOne = buy with USDC (true) / sell token for USDC (false). */
  zeroForOne: boolean
  /** Exact input amount in base units (18 dp native USDC / token decimals). */
  amountIn: bigint
  hooks?: `0x${string}`
}

/** Quote a v4 single-hop swap through the V4 Quoter (fees included).
 *  Returns the output token decimals so the renderer can format units
 *  (tokens may use 6 or 18 decimals; native USDC is 18). */
export async function arcQuote(params: ArcQuoteParams): Promise<{ amountOut: bigint; decimals: number }> {
  const poolKey = poolKeyFor(params.token, params.hooks)
  const result = await publicClient().simulateContract({
    address: ARC_CONTRACTS().v4Quoter,
    abi: quoterAbi,
    functionName: 'quoteExactInputSingle',
    args: [
      {
        poolKey,
        zeroForOne: params.zeroForOne,
        exactAmount: params.amountIn as never,
        hookData: '0x',
      },
    ],
  })
  // Output currency: token when buying, native USDC when selling.
  const decimals = params.zeroForOne ? await tokenDecimals(params.token) : 18
  return { amountOut: result.result[0] as bigint, decimals }
}

async function tokenDecimals(token: string): Promise<number> {
  if (!token || token === NATIVE_USDC) return 18
  try {
    const dec = (await publicClient().readContract({
      address: token as `0x${string}`,
      abi: erc20DecimalsAbi,
      functionName: 'decimals',
      args: [],
    })) as bigint
    return Number(dec)
  } catch {
    return 18
  }
}

// --- Router calldata --------------------------------------------------------

const V4_SWAP = '0x10'
const ACTIONS = '0x060b0e' // SWAP_EXACT_IN_SINGLE, SETTLE, TAKE
const OPEN_DELTA = 0n
const MSG_SENDER = '0x0000000000000000000000000000000000000001'

function deadline(): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + 600)
}

function routeCalldata(args: {
  token: string
  zeroForOne: boolean
  amountIn: bigint
  amountOutMinimum: bigint
  hooks?: `0x${string}`
}): `0x${string}` {
  const poolKey = poolKeyFor(args.token, args.hooks)
  const swap = encodeAbiParameters(
    parseAbiParameters(
      '((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, bool zeroForOne, uint128 amountIn, uint128 amountOutMinimum, uint256 minHopPriceX36, bytes hookData)',
    ),
    [
      {
        poolKey,
        zeroForOne: args.zeroForOne,
        amountIn: args.amountIn,
        amountOutMinimum: args.amountOutMinimum,
        minHopPriceX36: 0n,
        hookData: '0x',
      },
    ],
  )
  const currencyIn = args.zeroForOne ? poolKey.currency0 : poolKey.currency1
  const currencyOut = args.zeroForOne ? poolKey.currency1 : poolKey.currency0
  const settle = encodeAbiParameters(
    parseAbiParameters('address currency, uint256 amount, bool payerIsUser'),
    [currencyIn, OPEN_DELTA, !args.zeroForOne],
  )
  const take = encodeAbiParameters(
    parseAbiParameters('address currency, address recipient, uint256 amount'),
    [currencyOut, MSG_SENDER, OPEN_DELTA],
  )
  const input = encodeAbiParameters(parseAbiParameters('bytes actions, bytes[] params'), [
    ACTIONS,
    [swap, settle, take],
  ])
  return encodeFunctionData({
    abi: routerAbi,
    functionName: 'execute',
    args: [V4_SWAP, [input], deadline()],
  })
}

// --- Permit2 approvals (sell path) ------------------------------------------

async function ensureSellApprovals(
  wallet: {
    writeContract: (args: { address: `0x${string}`; abi: unknown; functionName: string; args: unknown[] }) => Promise<`0x${string}`>
  },
  account: { address: `0x${string}` },
  token: `0x${string}`,
  amountIn: bigint,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  // 1) token.approve(PERMIT2)
  const tokenAllowance = (await publicClient().readContract({
    address: token as `0x${string}`,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [account.address, ARC_CONTRACTS().permit2],
  })) as bigint
  if (tokenAllowance < amountIn) {
    const hash = await wallet.writeContract({
      address: token as `0x${string}`,
      abi: erc20Abi,
      functionName: 'approve',
      args: [(1n << 256n) - 1n, ARC_CONTRACTS().permit2],
    })
    await publicClient().waitForTransactionReceipt({ hash })
  }
  // 2) Permit2.approve(token, ROUTER)
  const allowanceData = encodeFunctionData({
    abi: permit2AllowanceAbi,
    functionName: 'allowance',
    args: [account.address, token, ARC_CONTRACTS().universalRouter],
  })
  const allowanceRes = await publicClient().call({
    to: ARC_CONTRACTS().permit2,
    data: allowanceData,
  })
  // permit2 allowance returns (uint160, uint48, uint48), one 32-byte word each.
  const words = allowanceRes.data.slice(2).match(/.{1,64}/g) ?? []
  const allowed = BigInt('0x' + (words[0] ?? '0'))
  const expiration = BigInt('0x' + (words[1] ?? '0'))
  if (allowed < amountIn || expiration <= now + 60) {
    const hash = await wallet.writeContract({
      address: ARC_CONTRACTS().permit2,
      abi: permit2ApproveAbi,
      functionName: 'approve',
      args: [token, ARC_CONTRACTS().universalRouter, (1n << 160n) - 1n, now + 30 * 24 * 3600],
    })
    await publicClient().waitForTransactionReceipt({ hash })
  }
}

// --- Swap -------------------------------------------------------------------

export interface ArcSwapParams {
  privateKey: string
  token: string
  zeroForOne: boolean
  amountIn: bigint
  amountOutMinimum: bigint
  hooks?: `0x${string}`
}

/** Broadcast a v4 swap. Returns the tx hash; receipt settles after. */
export async function arcSwap(params: ArcSwapParams): Promise<{ hash: string }> {
  const account = privateKeyToAccount(params.privateKey as `0x${string}`)
  const wallet = createWalletClient({ account, chain: chain(), transport: http() }) as unknown as {
    writeContract: (args: { address: `0x${string}`; abi: unknown; functionName: string; args: unknown[] }) => Promise<`0x${string}`>
    sendTransaction: (args: { to: `0x${string}`; data: `0x${string}`; value?: bigint }) => Promise<`0x${string}`>
  }

  if (!params.zeroForOne) {
    await ensureSellApprovals(wallet, account, params.token as `0x${string}`, params.amountIn)
  }

  const data = routeCalldata({
    token: params.token,
    zeroForOne: params.zeroForOne,
    amountIn: params.amountIn,
    amountOutMinimum: params.amountOutMinimum,
    hooks: params.hooks,
  })

  const hash = await wallet.sendTransaction({
    to: ARC_CONTRACTS().universalRouter,
    data,
    value: params.zeroForOne ? params.amountIn : 0n,
  })
  return { hash }
}

/** Wait for a tx receipt (used by the UI to show success/failure). */
export async function arcWaitReceipt(hash: string): Promise<{ status: 'success' | 'reverted' }> {
  const receipt = await publicClient().waitForTransactionReceipt({ hash: hash as `0x${string}` })
  return { status: receipt.status === 'success' ? 'success' : 'reverted' }
}

// --- Balances ---------------------------------------------------------------

export interface ArcBalances {
  nativeUsdc: string
  token: string
}

export async function arcBalances(
  address: `0x${string}`,
  token: string,
): Promise<ArcBalances> {
  const tokenAddr = token as `0x${string}`
  const native = await publicClient().getBalance({ address })
  let tokenBalance = 0n
  if (token && token !== NATIVE_USDC) {
    tokenBalance = (await publicClient().readContract({
      address: tokenAddr,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [address],
    })) as bigint
  }
  return {
    nativeUsdc: formatUnits(native, 18),
    token: formatUnits(tokenBalance, 6),
  }
}
