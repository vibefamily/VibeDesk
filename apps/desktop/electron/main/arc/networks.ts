/**
 * ARC network registry - dual-network configuration (testnet/mainnet).
 *
 * Pattern borrowed from the chain95 reference project (config.ts):
 * chain metadata + a protocol address table that marks every address as
 * VERIFIED or PLACEHOLDER. Switching networks only swaps this config;
 * business code never hard-codes a chain.
 *
 * Testnet values are the verified Minara Uniswap v4 deployment
 * (https://minara.fun/docs). Mainnet values are PLACEHOLDERS until the
 * Arc Mainnet deployment is confirmed (RPC, chainId, explorer and v4
 * addresses) - see docs/ethglobal2026/05-Uniswap与Arc链上可视化模块建议.md.
 */

export type ArcNetworkId = 'testnet' | 'mainnet'

export interface ArcNetworkConfig {
  id: ArcNetworkId
  name: string
  chainId: number
  rpcUrl: string
  explorerBase: string
  /** Native gas token on Arc is USDC (18 decimals). */
  nativeSymbol: string
  nativeDecimals: number
  uniswap: {
    permit2: `0x${string}`
    poolManager: `0x${string}`
    positionManager: `0x${string}`
    stateView: `0x${string}`
    v4Quoter: `0x${string}`
    universalRouter: `0x${string}`
  }
}

/** All fields VERIFIED unless the comment says PLACEHOLDER. */
export const ARC_NETWORKS: Record<ArcNetworkId, ArcNetworkConfig> = {
  testnet: {
    id: 'testnet',
    name: 'Arc Testnet',
    chainId: 5042002,
    rpcUrl: 'https://rpc.testnet.arc.network',
    explorerBase: 'https://testnet.arcscan.app',
    nativeSymbol: 'USDC',
    nativeDecimals: 18,
    uniswap: {
      permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
      poolManager: '0x1d70945634F618eefdF9EDaAdB59B9A183CEF929',
      positionManager: '0xaB247a9F430297b23D0e02FC94c3Be4bB36f3897',
      stateView: '0xAB5E318cAa0CA7d47b71e74d1e7fFCEE03f316Bf',
      v4Quoter: '0x01F1c491b23525B2aBe996bB9551FE36cf2b2b3E',
      universalRouter: '0xE72F8175AB0991dBb778F6DE62009c5BF97c17f7',
    },
  },
  mainnet: {
    id: 'mainnet',
    name: 'Arc Mainnet',
    // PLACEHOLDER: verify the Arc Mainnet chainId / public RPC / explorer.
    chainId: 0,
    rpcUrl: '',
    explorerBase: 'https://arcscan.app',
    nativeSymbol: 'USDC',
    nativeDecimals: 18,
    // PLACEHOLDER: confirm whether Minara deployed v4 on Mainnet, or use
    // the official/third-party Uniswap v4 deployment on Arc Mainnet.
    uniswap: {
      permit2: '' as `0x${string}`,
      poolManager: '' as `0x${string}`,
      positionManager: '' as `0x${string}`,
      stateView: '' as `0x${string}`,
      v4Quoter: '' as `0x${string}`,
      universalRouter: '' as `0x${string}`,
    },
  },
}
