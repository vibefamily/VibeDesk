/**
 * Vibe Strategy Engine - lightweight backtesting and strategy framework.
 *
 * Features:
 * - Event-driven backtesting engine
 * - Technical indicator library (SMA, EMA, RSI, Bollinger Bands, MACD)
 * - Strategy base class with simple API
 * - Built-in strategies (SMA Crossover, Mean Reversion)
 * - Performance analysis (Sharpe, Sortino, Calmar, max drawdown, etc.)
 * - Strategy registry for plugin-based extensibility
 */

export * from './engine'
export * from './indicators'
export * from './strategy'
export * from './analysis'
export * from './strategies'

/**
 * Convenience function to run a quick backtest.
 */
import { BacktestEngine } from './engine/BacktestEngine'
import type { BacktestConfig, BacktestReport, CandleData } from '@vibe/shared'
import type { Strategy } from './strategy/Strategy'

export function runBacktest(
  strategy: Strategy,
  config: BacktestConfig,
  candles: CandleData[],
): BacktestReport {
  const engine = new BacktestEngine(strategy, config, candles)
  return engine.run()
}
