/**
 * Strategy base class.
 *
 * All Vibe strategies extend this class and implement the `next` method,
 * which is called for each bar during backtesting or live trading.
 *
 * The pattern is inspired by backtrader but simplified for TypeScript.
 */

import type { CandleData, OrderRequest, OrderSide } from '@vibe/shared'

/** Strategy context - available data and utilities for the strategy */
export interface StrategyContext {
  /** Current candle data (historical series) */
  candles: CandleData[]
  /** Current position size (positive = long, negative = short, 0 = flat) */
  position: number
  /** Average entry price of current position */
  entryPrice: number
  /** Available cash */
  cash: number
  /** Current portfolio value */
  portfolioValue: number
  /** Current bar index */
  barIndex: number
  /** Current timestamp */
  timestamp: number
}

/** Order executor - passed to strategy to place orders */
export interface OrderExecutor {
  /** Place a market order */
  marketOrder(side: OrderSide, size: number): void
  /** Place a limit order */
  limitOrder(side: OrderSide, size: number, price: number): void
  /** Close current position with a market order */
  close(): void
  /** Cancel all open orders */
  cancelAll(): void
}

/**
 * Base strategy class.
 *
 * Subclasses implement `init()` for setup and `next()` for per-bar logic.
 * Use `this.buy()`, `this.sell()`, `this.close()` to issue orders.
 */
export abstract class Strategy {
  /** Strategy name (override in subclass) */
  static strategyName = 'BaseStrategy'
  static strategyId = 'base'
  static description = 'Base strategy class'
  static category = 'other'
  static supportedMarkets: string[] = ['spot']
  static defaultParams: Record<string, { label: string; type: string; defaultValue: unknown }> = {}

  /** Strategy parameters (set by the engine) */
  protected params: Record<string, unknown> = {}

  /** Current context (updated each bar by the engine) */
  protected context!: StrategyContext

  /** Order executor (set by the engine) */
  protected executor!: OrderExecutor

  /**
   * Called once before the strategy starts running.
   * Use this to initialize indicators and state.
   */
  init(_params: Record<string, unknown>): void {
    this.params = _params
  }

  /**
   * Called once when the strategy starts (after init, before first bar).
   */
  start(): void {
    // Optional: override in subclass
  }

  /**
   * Called for each bar in the data series.
   * Access current data via `this.context` and place orders via `this.buy/sell/close`.
   */
  abstract next(): void

  /**
   * Called once after all bars are processed.
   * Use for cleanup or final calculations.
   */
  stop(): void {
    // Optional: override in subclass
  }

  // --- Convenience order methods ---

  protected buy(size: number): void {
    this.executor.marketOrder('buy', size)
  }

  protected sell(size: number): void {
    this.executor.marketOrder('sell', size)
  }

  protected closePosition(): void {
    this.executor.close()
  }

  protected buyLimit(size: number, price: number): void {
    this.executor.limitOrder('buy', size, price)
  }

  protected sellLimit(size: number, price: number): void {
    this.executor.limitOrder('sell', size, price)
  }

  // --- Convenience accessors ---

  protected get candles(): CandleData[] {
    return this.context.candles
  }

  protected get close(): number {
    return this.context.candles[this.context.barIndex]!.close
  }

  protected get position(): number {
    return this.context.position
  }

  protected get cash(): number {
    return this.context.cash
  }
}

/**
 * Strategy class type (for registering strategy constructors).
 */
export type StrategyClass = new () => Strategy
