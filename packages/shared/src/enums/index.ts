/**
 * Enumerations used across Vibe packages.
 *
 * Prefer string union types for most use cases; only use
 * actual TS `enum` when you need runtime values / iteration.
 */

/** Risk level for agents and strategies */
export enum RiskLevel {
  CONSERVATIVE = 'conservative',
  MODERATE = 'moderate',
  AGGRESSIVE = 'aggressive',
}

/** Exchange category */
export enum ExchangeCategory {
  CEX = 'cex',
  DEX = 'dex',
  CHAIN = 'chain',
}

/** Strategy category */
export enum StrategyCategory {
  ARBITRAGE = 'arbitrage',
  TREND = 'trend',
  MEAN_REVERSION = 'mean_reversion',
  MARKET_MAKING = 'market_making',
  OTHER = 'other',
}
