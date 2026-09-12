/**
 * ARC Testnet on-chain module (main process).
 *
 * Live Uniswap v4 swaps on Arc (chainId 5042002, gas = native USDC)
 * through the Minara-deployed Universal Router. Flow:
 *
 *   quote  ->  approve (sell only, Permit2)  ->  swap  ->  tx hash
 *
 * Private keys come from the wallet vault's in-memory agent
 * authorization (getAuthorizedKey) and never leave the main process.
 * Contract addresses are the Minara ARC Testnet deployment:
 * https://minara.fun/docs
 */

import { createPublicClient, createWalletClient, http, defineChain, formatUnits } from 'viem'
import type { Abi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { encodeAbiParameters, encodeFunctionData, keccak256, parseAbiParameters } from 'viem'

// --- Chain ------------------------------------------------------------------

export const arcChain = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.network'] } },
  blockExplorers: { default: { name: 'Arcscan', url: 'https://testnet.arcscan.app' } },
})

export const ARC_EXPLORER_TX = 'https://testnet.arcscan.app/tx/'

// --- Minara Uniswap v4 contracts (ARC Testnet) ------------------------------

export const ARC_CONTRACTS = {
  permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
  poolManager: '0x1d70945634F618eefdF9EDaAdB59B9A183CEF929',
  positionManager: '0xaB247a9F430297b23D0e02FC94c3Be4bB36f3897',
  stateView: '0xAB5E318cAa0CA7d47b71e74d1e7fFCEE03f316Bf',
  v4Quoter: '0x01F1c491b23525B2aBe996bB9551FE36cf2b2b3E',
  universalRouter: '0xE72F8175AB0991dBb778F6DE62009c5BF97c17f7',
} as const

/** Native USDC placeholder used as currency0 in Minara pools. */
export const NATIVE_USDC = '0x0000000000000000000000000000000000000000' as `0x${string}`

// --- Clients ----------------------------------------------------------------

// viem 2.56's generic inference is unreliable for contract calls in this
// monorepo's TS setup; the clients below keep the exact viem runtime API
// with explicit loose types (runtime behavior is unchanged and verified).
const publicClient = createPublicClient({ chain: arcChain, transport: http() }) as unknown as {
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
export function poolKeyFor(token: string, hooks: `0x${string}` = NATIVE_USDC): ArcPoolKey {
  return {
    currency0: NATIVE_USDC,
    currency1: token as `0x${string}`,
    fee: 2500,
    tickSpacing: 25,
    hooks,
  }
}

export function poolIdFor(token: string, hooks: `0x${string}` = NATIVE_USDC): `0x${string}` {
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

/** Quote a v4 single-hop swap through the V4 Quoter (fees included). */
export async function arcQuote(params: ArcQuoteParams): Promise<{ amountOut: bigint }> {
  const poolKey = poolKeyFor(params.token, params.hooks)
  const result = await publicClient.simulateContract({
    address: ARC_CONTRACTS.v4Quoter,
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
  return { amountOut: result.result[0] as bigint }
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
  const tokenAllowance = (await publicClient.readContract({
    address: token as `0x${string}`,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [account.address, ARC_CONTRACTS.permit2],
  })) as bigint
  if (tokenAllowance < amountIn) {
    const hash = await wallet.writeContract({
      address: token as `0x${string}`,
      abi: erc20Abi,
      functionName: 'approve',
      args: [(1n << 256n) - 1n, ARC_CONTRACTS.permit2],
    })
    await publicClient.waitForTransactionReceipt({ hash })
  }
  // 2) Permit2.approve(token, ROUTER)
  const allowanceData = encodeFunctionData({
    abi: permit2AllowanceAbi,
    functionName: 'allowance',
    args: [account.address, token, ARC_CONTRACTS.universalRouter],
  })
  const allowanceRes = await publicClient.call({
    to: ARC_CONTRACTS.permit2,
    data: allowanceData,
  })
  // permit2 allowance returns (uint160, uint48, uint48), one 32-byte word each.
  const words = allowanceRes.data.slice(2).match(/.{1,64}/g) ?? []
  const allowed = BigInt('0x' + (words[0] ?? '0'))
  const expiration = BigInt('0x' + (words[1] ?? '0'))
  if (allowed < amountIn || expiration <= now + 60) {
    const hash = await wallet.writeContract({
      address: ARC_CONTRACTS.permit2,
      abi: permit2ApproveAbi,
      functionName: 'approve',
      args: [token, ARC_CONTRACTS.universalRouter, (1n << 160n) - 1n, now + 30 * 24 * 3600],
    })
    await publicClient.waitForTransactionReceipt({ hash })
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
  const wallet = createWalletClient({ account, chain: arcChain, transport: http() }) as unknown as {
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
    to: ARC_CONTRACTS.universalRouter,
    data,
    value: params.zeroForOne ? params.amountIn : 0n,
  })
  return { hash }
}

/** Wait for a tx receipt (used by the UI to show success/failure). */
export async function arcWaitReceipt(hash: string): Promise<{ status: 'success' | 'reverted' }> {
  const receipt = await publicClient.waitForTransactionReceipt({ hash: hash as `0x${string}` })
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
  const native = await publicClient.getBalance({ address })
  let tokenBalance = 0n
  if (token && token !== NATIVE_USDC) {
    tokenBalance = (await publicClient.readContract({
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
