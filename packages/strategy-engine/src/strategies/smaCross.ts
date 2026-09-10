/**
 * SMA Crossover strategy - simple moving average crossover.
 *
 * Generates a buy signal when the fast SMA crosses above the slow SMA
 * (golden cross) and a sell signal when it crosses below (death cross).
 *
 * This is a classic trend-following strategy used as a baseline benchmark.
 */

import type { StrategyInfo } from '@vibe/shared'
import { Strategy } from '../strategy/Strategy'
import { sma } from '../indicators/sma'

export const smaCrossInfo: StrategyInfo = {
  id: 'sma_cross',
  name: 'SMA Crossover',
  description: 'Trend-following strategy using two moving average crossovers. Buy when fast SMA crosses above slow SMA, sell when it crosses below.',
  version: '1.0.0',
  category: 'trend',
  supportedMarkets: ['spot'],
  supportsLive: true,
  supportsBacktest: true,
  defaultParams: {
    fastPeriod: {
      type: 'number',
      label: 'Fast SMA Period',
      description: 'Fast moving average period',
      defaultValue: 10,
      min: 2,
      max: 100,
      step: 1,
      optimizable: true,
    },
    slowPeriod: {
      type: 'number',
      label: 'Slow SMA Period',
      description: 'Slow moving average period',
      defaultValue: 30,
      min: 5,
      max: 200,
      step: 1,
      optimizable: true,
    },
  },
}

export class SmaCrossStrategy extends Strategy {
  static override strategyName = 'SMA Crossover'
  static override strategyId = 'sma_cross'

  private fastPeriod = 10
  private slowPeriod = 30
  private fastSma: number[] = []
  private slowSma: number[] = []
  private prevFast = NaN
  private prevSlow = NaN

  override init(params: Record<string, unknown>): void {
    super.init(params)
    this.fastPeriod = Number(params.fastPeriod ?? 10)
    this.slowPeriod = Number(params.slowPeriod ?? 30)
  }

  override next(): void {
    const { candles, barIndex } = this.context

    // Compute SMAs incrementally
    if (barIndex === 0) {
      const closes = candles.map((c) => c.close)
      this.fastSma = sma(closes, this.fastPeriod)
      this.slowSma = sma(closes, this.slowPeriod)
    }

    const fast = this.fastSma[barIndex]!
    const slow = this.slowSma[barIndex]!

    if (Number.isNaN(fast) || Number.isNaN(slow)) {
      this.prevFast = fast
      this.prevSlow = slow
      return
    }

    // Golden cross: fast crosses above slow
    if (this.prevFast <= this.prevSlow && fast > slow) {
      if (this.position <= 0) {
        // Close short if any, go long
        if (this.position < 0) this.closePosition()
        const size = Math.floor((this.cash / candles[barIndex]!.close) * 100) / 100
        if (size > 0) this.buy(size)
      }
    }

    // Death cross: fast crosses below slow
    if (this.prevFast >= this.prevSlow && fast < slow) {
      if (this.position > 0) {
        this.closePosition()
      }
    }

    this.prevFast = fast
    this.prevSlow = slow
  }
}
