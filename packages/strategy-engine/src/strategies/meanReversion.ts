/**
 * Mean Reversion strategy - RSI-based oversold/overbought trading.
 *
 * Buys when RSI drops below the oversold threshold and sells when
 * it rises above the overbought threshold. Assumes price tends to
 * revert to its mean.
 */

import type { StrategyInfo } from '@vibe/shared'
import { Strategy } from '../strategy/Strategy'
import { rsi } from '../indicators/rsi'

export const meanReversionInfo: StrategyInfo = {
  id: 'mean_reversion',
  name: 'RSI Mean Reversion',
  description: 'Contrarian strategy using RSI indicator. Buy when RSI drops below oversold threshold, sell when RSI rises above overbought threshold.',
  version: '1.0.0',
  category: 'mean_reversion',
  supportedMarkets: ['spot'],
  supportsLive: true,
  supportsBacktest: true,
  defaultParams: {
    period: {
      type: 'number',
      label: 'RSI Period',
      description: 'RSI lookback period',
      defaultValue: 14,
      min: 2,
      max: 50,
      step: 1,
      optimizable: true,
    },
    oversold: {
      type: 'number',
      label: 'Oversold Level',
      description: 'RSI level below which to buy',
      defaultValue: 30,
      min: 10,
      max: 50,
      step: 1,
      optimizable: true,
    },
    overbought: {
      type: 'number',
      label: 'Overbought Level',
      description: 'RSI level above which to sell',
      defaultValue: 70,
      min: 50,
      max: 90,
      step: 1,
      optimizable: true,
    },
  },
}

export class MeanReversionStrategy extends Strategy {
  static override strategyName = 'RSI Mean Reversion'
  static override strategyId = 'mean_reversion'

  private period = 14
  private oversold = 30
  private overbought = 70
  private rsiValues: number[] = []

  override init(params: Record<string, unknown>): void {
    super.init(params)
    this.period = Number(params.period ?? 14)
    this.oversold = Number(params.oversold ?? 30)
    this.overbought = Number(params.overbought ?? 70)
  }

  override next(): void {
    const { candles, barIndex } = this.context

    // Compute RSI
    if (barIndex === 0) {
      const closes = candles.map((c) => c.close)
      this.rsiValues = rsi(closes, this.period)
    }

    const rsiVal = this.rsiValues[barIndex]!
    if (Number.isNaN(rsiVal)) return

    const currentPrice = candles[barIndex]!.close

    // Oversold - buy signal
    if (rsiVal < this.oversold && this.position <= 0) {
      if (this.position < 0) this.closePosition()
      const size = Math.floor((this.cash / currentPrice) * 100) / 100
      if (size > 0) this.buy(size)
    }

    // Overbought - sell signal
    if (rsiVal > this.overbought && this.position > 0) {
      this.closePosition()
    }
  }
}
