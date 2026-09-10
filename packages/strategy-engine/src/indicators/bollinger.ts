/**
 * Bollinger Bands indicator.
 *
 * Consists of a middle band (SMA) and upper/lower bands at standard
 * deviation distances. Used to identify overbought/oversold conditions
 * and volatility.
 */

import type { CandleData } from '@vibe/shared'
import { sma } from './sma'

/** Bollinger Bands result */
export interface BollingerResult {
  middle: number[]
  upper: number[]
  lower: number[]
  /** Bandwidth (%) */
  bandwidth: number[]
  /** %B indicator (position within bands, 0 = lower, 1 = upper) */
  percentB: number[]
}

/**
 * Calculate Bollinger Bands.
 * @param values - Array of numeric values
 * @param period - SMA period (typically 20)
 * @param numStdDev - Number of standard deviations (typically 2)
 */
export function bollingerBands(
  values: number[],
  period = 20,
  numStdDev = 2,
): BollingerResult {
  const n = values.length
  const middle = sma(values, period)
  const upper: number[] = new Array(n).fill(NaN)
  const lower: number[] = new Array(n).fill(NaN)
  const bandwidth: number[] = new Array(n).fill(NaN)
  const percentB: number[] = new Array(n).fill(NaN)

  if (period <= 0 || n < period) {
    return { middle, upper, lower, bandwidth, percentB }
  }

  // Rolling standard deviation
  for (let i = period - 1; i < n; i++) {
    const mean = middle[i]!
    let sumSq = 0
    for (let j = i - period + 1; j <= i; j++) {
      const diff = values[j]! - mean
      sumSq += diff * diff
    }
    const stdDev = Math.sqrt(sumSq / period)

    upper[i] = mean + numStdDev * stdDev
    lower[i] = mean - numStdDev * stdDev
    bandwidth[i] = mean > 0 ? ((upper[i]! - lower[i]!) / mean) * 100 : NaN

    const range = upper[i]! - lower[i]!
    percentB[i] = range > 0 ? (values[i]! - lower[i]!) / range : 0.5
  }

  return { middle, upper, lower, bandwidth, percentB }
}

/**
 * Calculate Bollinger Bands from candle data using close prices.
 */
export function bollingerBandsFromCandles(
  candles: CandleData[],
  period = 20,
  numStdDev = 2,
): BollingerResult {
  const closes = candles.map((c) => c.close)
  return bollingerBands(closes, period, numStdDev)
}
