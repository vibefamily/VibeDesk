/**
 * Exponential Moving Average (EMA) indicator.
 *
 * Gives more weight to recent prices. The multiplier (smoothing factor)
 * defaults to 2 / (period + 1), the standard EMA formula.
 */

import type { CandleData } from '@vibe/shared'
import { sma } from './sma'

/**
 * Calculate Exponential Moving Average.
 * @param values - Array of numeric values
 * @param period - Lookback period
 * @param smoothing - Smoothing factor (default: 2 / (period + 1))
 * @returns Array of EMA values (first `period - 1` entries are NaN)
 */
export function ema(values: number[], period: number, smoothing?: number): number[] {
  const result: number[] = new Array(values.length).fill(NaN)
  if (period <= 0 || values.length < period) return result

  const k = smoothing ?? 2 / (period + 1)

  // Seed EMA with SMA of the first period
  const seedSma = sma(values.slice(0, period), period)
  let current = seedSma[period - 1]!
  result[period - 1] = current

  for (let i = period; i < values.length; i++) {
    current = values[i]! * k + current * (1 - k)
    result[i] = current
  }

  return result
}

/**
 * Calculate EMA from candle data using close prices.
 */
export function emaFromCandles(candles: CandleData[], period: number): number[] {
  const closes = candles.map((c) => c.close)
  return ema(closes, period)
}
