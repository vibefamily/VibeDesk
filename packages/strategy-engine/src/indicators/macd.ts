/**
 * MACD (Moving Average Convergence Divergence) indicator.
 *
 * Shows the relationship between two exponential moving averages.
 * Consists of MACD line, signal line, and histogram.
 */

import type { CandleData } from '@vibe/shared'
import { ema } from './ema'

/** MACD result */
export interface MacdResult {
  /** MACD line (fast EMA - slow EMA) */
  macd: number[]
  /** Signal line (EMA of MACD line) */
  signal: number[]
  /** Histogram (MACD - signal) */
  histogram: number[]
}

/**
 * Calculate MACD.
 * @param values - Array of numeric values
 * @param fastPeriod - Fast EMA period (typically 12)
 * @param slowPeriod - Slow EMA period (typically 26)
 * @param signalPeriod - Signal EMA period (typically 9)
 */
export function macd(
  values: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): MacdResult {
  const n = values.length
  const fastEma = ema(values, fastPeriod)
  const slowEma = ema(values, slowPeriod)

  const macdLine: number[] = new Array(n).fill(NaN)
  for (let i = 0; i < n; i++) {
    if (!Number.isNaN(fastEma[i]) && !Number.isNaN(slowEma[i])) {
      macdLine[i] = fastEma[i]! - slowEma[i]!
    }
  }

  // Find first valid MACD value to compute signal EMA from
  let firstValid = -1
  for (let i = 0; i < n; i++) {
    if (!Number.isNaN(macdLine[i])) {
      firstValid = i
      break
    }
  }

  const signal: number[] = new Array(n).fill(NaN)
  const histogram: number[] = new Array(n).fill(NaN)

  if (firstValid >= 0 && n - firstValid >= signalPeriod) {
    // Compute EMA of MACD line starting from first valid index
    const slice = macdLine.slice(firstValid)
    const signalSlice = ema(slice, signalPeriod)
    for (let i = 0; i < signalSlice.length; i++) {
      signal[firstValid + i] = signalSlice[i]!
      if (!Number.isNaN(signalSlice[i])) {
        histogram[firstValid + i] = macdLine[firstValid + i]! - signalSlice[i]!
      }
    }
  }

  return { macd: macdLine, signal, histogram }
}

/**
 * Calculate MACD from candle data using close prices.
 */
export function macdFromCandles(
  candles: CandleData[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): MacdResult {
  const closes = candles.map((c) => c.close)
  return macd(closes, fastPeriod, slowPeriod, signalPeriod)
}
