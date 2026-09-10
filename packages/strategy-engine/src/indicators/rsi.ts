/**
 * Relative Strength Index (RSI) indicator.
 *
 * Measures the speed and magnitude of recent price changes.
 * RSI > 70 is typically considered overbought, < 30 oversold.
 * Uses Wilder's smoothing method.
 */

import type { CandleData } from '@vibe/shared'

/**
 * Calculate RSI using Wilder's smoothing method.
 * @param values - Array of numeric values
 * @param period - Lookback period (typically 14)
 * @returns Array of RSI values (0-100, first `period` entries are NaN)
 */
export function rsi(values: number[], period = 14): number[] {
  const result: number[] = new Array(values.length).fill(NaN)
  if (period <= 0 || values.length <= period) return result

  // Calculate initial average gain/loss from first period
  let avgGain = 0
  let avgLoss = 0
  for (let i = 1; i <= period; i++) {
    const change = values[i]! - values[i - 1]!
    if (change > 0) {
      avgGain += change
    } else {
      avgLoss -= change
    }
  }
  avgGain /= period
  avgLoss /= period

  if (avgLoss === 0) {
    result[period] = 100
  } else {
    const rs = avgGain / avgLoss
    result[period] = 100 - 100 / (1 + rs)
  }

  // Wilder's smoothing for subsequent values
  for (let i = period + 1; i < values.length; i++) {
    const change = values[i]! - values[i - 1]!
    const gain = change > 0 ? change : 0
    const loss = change < 0 ? -change : 0

    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period

    if (avgLoss === 0) {
      result[i] = 100
    } else if (avgGain === 0) {
      result[i] = 0
    } else {
      const rs = avgGain / avgLoss
      result[i] = 100 - 100 / (1 + rs)
    }
  }

  return result
}

/**
 * Calculate RSI from candle data using close prices.
 */
export function rsiFromCandles(candles: CandleData[], period = 14): number[] {
  const closes = candles.map((c) => c.close)
  return rsi(closes, period)
}
