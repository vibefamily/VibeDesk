/**
 * Simple Moving Average (SMA) indicator.
 *
 * Calculates the average price over a specified period.
 * Uses a sliding window approach for O(n) total computation.
 */

import type { CandleData } from '@vibe/shared'

/**
 * Calculate Simple Moving Average over an array of values.
 * @param values - Array of numeric values
 * @param period - Lookback period
 * @returns Array of SMA values (first `period - 1` entries are NaN)
 */
export function sma(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length).fill(NaN)
  if (period <= 0 || values.length < period) return result

  let sum = 0
  for (let i = 0; i < period; i++) {
    sum += values[i]!
  }
  result[period - 1] = sum / period

  for (let i = period; i < values.length; i++) {
    sum = sum - values[i - period]! + values[i]!
    result[i] = sum / period
  }

  return result
}

/**
 * Calculate SMA from candle data using close prices.
 */
export function smaFromCandles(candles: CandleData[], period: number): number[] {
  const closes = candles.map((c) => c.close)
  return sma(closes, period)
}
