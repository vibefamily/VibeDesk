/**
 * Lightweight vectorized + event-driven backtest engine.
 *
 * Supports single-asset strategies with:
 * - Market and limit orders
 * - Fees and slippage modeling
 * - Position sizing
 * - Full trade history and equity curve
 */

import type {
  BacktestConfig,
  BacktestReport,
  BacktestResult,
  CandleData,
  EquityPoint,
  OrderSide,
  TradeRecord,
} from '@vibe/shared'
import { generateId } from '@vibe/shared/utils'
import type { Strategy, StrategyContext, OrderExecutor } from '../strategy/Strategy'
import { computePerformance } from '../analysis/performance'

/** Internal order representation for backtesting */
interface BacktestOrder {
  id: string
  side: OrderSide
  type: 'market' | 'limit'
  size: number
  price?: number
  status: 'pending' | 'filled' | 'cancelled'
  filledAt?: number
  filledPrice?: number
}

/**
 * BacktestEngine - runs a strategy against historical candle data.
 *
 * Iterates through each candle, calling the strategy's `next()` method,
 * and simulates order execution with fees and slippage.
 */
export class BacktestEngine {
  private strategy: Strategy
  private config: BacktestConfig
  private candles: CandleData[]

  // State
  private cash = 0
  private position = 0
  private entryPrice = 0
  private equityCurve: EquityPoint[] = []
  private trades: TradeRecord[] = []
  private pendingOrders: BacktestOrder[] = []
  private peakEquity = 0
  private openTrade: { entryTime: number; entryPrice: number; side: OrderSide; size: number } | null = null

  constructor(strategy: Strategy, config: BacktestConfig, candles: CandleData[]) {
    this.strategy = strategy
    this.config = config
    this.candles = candles
  }

  /**
   * Run the backtest and return a full report.
   */
  run(): BacktestReport {
    const { initialCapital } = this.config
    this.cash = initialCapital
    this.position = 0
    this.entryPrice = 0
    this.equityCurve = []
    this.trades = []
    this.pendingOrders = []
    this.peakEquity = initialCapital
    this.openTrade = null

    // Initialize strategy
    this.strategy.init(this.config.params)
    this.strategy.start()

    // Set up order executor
    const executor: OrderExecutor = {
      marketOrder: (side, size) => this.placeMarketOrder(side, size),
      limitOrder: (side, size, price) => this.placeLimitOrder(side, size, price),
      close: () => this.closePosition(),
      cancelAll: () => this.cancelAllOrders(),
    }
    ;(this.strategy as Strategy & { executor: OrderExecutor }).executor = executor

    // Iterate through candles
    for (let i = 0; i < this.candles.length; i++) {
      const candle = this.candles[i]!

      // Update strategy context
      const portfolioValue = this.cash + this.position * candle.close
      const context: StrategyContext = {
        candles: this.candles.slice(0, i + 1),
        position: this.position,
        entryPrice: this.entryPrice,
        cash: this.cash,
        portfolioValue,
        barIndex: i,
        timestamp: candle.timestamp,
      }
      ;(this.strategy as Strategy & { context: StrategyContext }).context = context

      // Process pending limit orders
      this.processPendingOrders(candle)

      // Call strategy
      this.strategy.next()

      // Process market orders placed this bar
      this.processMarketOrders(candle)

      // Update equity curve
      const equity = this.cash + this.position * candle.close
      if (equity > this.peakEquity) this.peakEquity = equity
      const drawdown = (this.peakEquity - equity) / this.peakEquity
      this.equityCurve.push({
        timestamp: candle.timestamp,
        equity,
        drawdown,
      })
    }

    // Close any open position at final bar
    if (this.position !== 0) {
      const lastCandle = this.candles[this.candles.length - 1]!
      this.executeClose(lastCandle.close, lastCandle.timestamp, lastCandle.close)
    }

    this.strategy.stop()

    // Compute performance metrics
    const result = computePerformance(
      this.equityCurve,
      this.trades,
      this.config.initialCapital,
    )

    return {
      config: this.config,
      result,
      equityCurve: this.equityCurve,
      trades: this.trades,
      generatedAt: Date.now(),
    }
  }

  // --- Order handling ---

  private placeMarketOrder(side: OrderSide, size: number): void {
    this.pendingOrders.push({
      id: generateId('bo_'),
      side,
      type: 'market',
      size,
      status: 'pending',
    })
  }

  private placeLimitOrder(side: OrderSide, size: number, price: number): void {
    this.pendingOrders.push({
      id: generateId('bo_'),
      side,
      type: 'limit',
      size,
      price,
      status: 'pending',
    })
  }

  private closePosition(): void {
    if (this.position === 0) return
    const side: OrderSide = this.position > 0 ? 'sell' : 'buy'
    this.placeMarketOrder(side, Math.abs(this.position))
  }

  private cancelAllOrders(): void {
    this.pendingOrders = this.pendingOrders.filter((o) => o.status !== 'pending')
  }

  private processMarketOrders(candle: CandleData): void {
    const marketOrders = this.pendingOrders.filter(
      (o) => o.type === 'market' && o.status === 'pending',
    )
    for (const order of marketOrders) {
      const execPrice = this.applySlippage(candle.close, order.side)
      this.fillOrder(order, execPrice, candle.timestamp)
    }
  }

  private processPendingOrders(candle: CandleData): void {
    for (const order of this.pendingOrders) {
      if (order.status !== 'pending' || order.type !== 'limit') continue
      if (order.price === undefined) continue

      const { high, low } = candle
      const price = order.price

      // Check if limit price was hit
      if (order.side === 'buy' && low <= price) {
        this.fillOrder(order, price, candle.timestamp)
      } else if (order.side === 'sell' && high >= price) {
        this.fillOrder(order, price, candle.timestamp)
      }
    }
  }

  private fillOrder(order: BacktestOrder, price: number, timestamp: number): void {
    const size = order.size
    const fee = price * size * this.config.feeRate
    const totalCost = price * size + (order.side === 'buy' ? fee : -fee)

    if (order.side === 'buy') {
      if (totalCost > this.cash) {
        // Not enough cash - cancel order
        order.status = 'cancelled'
        return
      }
      this.cash -= totalCost
      const newPosition = this.position + size
      // Update average entry price
      if (this.position > 0) {
        this.entryPrice = (this.entryPrice * this.position + price * size) / newPosition
      } else if (this.position < 0) {
        // Covering short - track pnl
        const pnl = (this.entryPrice - price) * Math.min(Math.abs(this.position), size)
        this.recordPartialClose(pnl, size, price, timestamp, 'buy')
        if (newPosition > 0) {
          this.entryPrice = price
        }
      } else {
        this.entryPrice = price
      }
      this.position = newPosition

      // Track open trade for long
      if (!this.openTrade && this.position > 0) {
        this.openTrade = { entryTime: timestamp, entryPrice: price, side: 'buy', size: this.position }
      }
    } else {
      // sell
      const proceeds = price * size - fee
      if (order.side === 'sell' && this.position < 0) {
        // Short selling
        const newPosition = this.position - size
        if (this.position < 0) {
          this.entryPrice = (this.entryPrice * Math.abs(this.position) + price * size) / Math.abs(newPosition)
        } else {
          this.entryPrice = price
        }
        this.position = newPosition
        if (!this.openTrade) {
          this.openTrade = { entryTime: timestamp, entryPrice: price, side: 'sell', size: Math.abs(this.position) }
        }
        this.cash += proceeds
      } else {
        // Selling long
        this.cash += proceeds
        const newPosition = this.position - size
        if (this.position > 0) {
          const pnl = (price - this.entryPrice) * Math.min(this.position, size)
          this.recordPartialClose(pnl, size, price, timestamp, 'sell')
        }
        this.position = newPosition
      }
    }

    order.status = 'filled'
    order.filledAt = timestamp
    order.filledPrice = price
  }

  private executeClose(price: number, timestamp: number, _candleClose: number): void {
    const side: OrderSide = this.position > 0 ? 'sell' : 'buy'
    const size = Math.abs(this.position)
    const order: BacktestOrder = {
      id: generateId('bo_'),
      side,
      type: 'market',
      size,
      status: 'pending',
    }
    this.fillOrder(order, price, timestamp)
  }

  private recordPartialClose(
    pnl: number,
    size: number,
    exitPrice: number,
    exitTime: number,
    exitSide: OrderSide,
  ): void {
    if (!this.openTrade) return

    const entrySide = this.openTrade.side
    const entryPrice = this.openTrade.entryPrice
    const entryTime = this.openTrade.entryTime
    const closeSize = Math.min(size, this.openTrade.size)

    const pnlPercent = entrySide === 'buy'
      ? (exitPrice - entryPrice) / entryPrice
      : (entryPrice - exitPrice) / entryPrice

    const trade: TradeRecord = {
      id: generateId('tr_'),
      symbol: this.config.symbols[0] ?? 'UNKNOWN',
      side: entrySide,
      entryPrice,
      exitPrice,
      quantity: closeSize,
      pnl,
      pnlPercent,
      entryTime,
      exitTime,
      duration: exitTime - entryTime,
      fees: (entryPrice + exitPrice) * closeSize * this.config.feeRate,
    }
    this.trades.push(trade)

    this.openTrade.size -= closeSize
    if (this.openTrade.size <= 0.00000001) {
      this.openTrade = null
    }
  }

  private applySlippage(price: number, side: OrderSide): number {
    const { slippageRate } = this.config
    if (side === 'buy') return price * (1 + slippageRate)
    return price * (1 - slippageRate)
  }
}
