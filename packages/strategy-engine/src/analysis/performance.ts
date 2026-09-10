/**
 * Performance analysis module.
 *
 * Computes standard trading performance metrics from equity curve
 * and trade history data.
 */

import type { BacktestResult, EquityPoint, TradeRecord } from '@vibe/shared'

const MS_PER_YEAR = 365 * 24 * 60 * 60 * 1000
const TRADING_DAYS_PER_YEAR = 252 // for daily-based Sharpe

/**
 * Compute comprehensive performance statistics.
 */
export function computePerformance(
  equityCurve: EquityPoint[],
  trades: TradeRecord[],
  initialCapital: number,
): BacktestResult {
  const finalEquity = equityCurve.length > 0
    ? equityCurve[equityCurve.length - 1]!.equity
    : initialCapital

  const totalReturn = (finalEquity - initialCapital) / initialCapital
  const maxDrawdown = computeMaxDrawdown(equityCurve)
  const { annualReturn, sharpeRatio, sortinoRatio } = computeReturnsStats(equityCurve, initialCapital)
  const { winRate, profitFactor, avgTradePnl, bestTrade, worstTrade, maxConsecutiveLosses } = computeTradeStats(trades)
  const peakEquity = computePeakEquity(equityCurve)

  // Calmar ratio: annual return / max drawdown
  const calmarRatio = maxDrawdown > 0 ? annualReturn / maxDrawdown : 0

  return {
    totalReturn,
    annualReturn,
    maxDrawdown,
    sharpeRatio,
    sortinoRatio,
    calmarRatio,
    winRate,
    profitFactor,
    totalTrades: trades.length,
    avgTradePnl,
    bestTrade,
    worstTrade,
    maxConsecutiveLosses,
    finalEquity,
    peakEquity,
  }
}

/**
 * Compute maximum drawdown from equity curve.
 */
export function computeMaxDrawdown(equityCurve: EquityPoint[]): number {
  if (equityCurve.length === 0) return 0

  let peak = equityCurve[0]!.equity
  let maxDD = 0

  for (const point of equityCurve) {
    if (point.equity > peak) {
      peak = point.equity
    }
    const dd = (peak - point.equity) / peak
    if (dd > maxDD) {
      maxDD = dd
    }
  }

  return maxDD
}

/**
 * Compute annualized return, Sharpe ratio, and Sortino ratio.
 */
function computeReturnsStats(
  equityCurve: EquityPoint[],
  initialCapital: number,
): { annualReturn: number; sharpeRatio: number; sortinoRatio: number } {
  if (equityCurve.length < 2) {
    return { annualReturn: 0, sharpeRatio: 0, sortinoRatio: 0 }
  }

  // Calculate period returns
  const returns: number[] = []
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1]!.equity
    const curr = equityCurve[i]!.equity
    if (prev > 0) {
      returns.push((curr - prev) / prev)
    }
  }

  if (returns.length === 0) {
    return { annualReturn: 0, sharpeRatio: 0, sortinoRatio: 0 }
  }

  // Time span
  const firstTs = equityCurve[0]!.timestamp
  const lastTs = equityCurve[equityCurve.length - 1]!.timestamp
  const years = Math.max((lastTs - firstTs) / MS_PER_YEAR, 1 / 365)

  // Total and annualized return
  const finalEquity = equityCurve[equityCurve.length - 1]!.equity
  const totalReturn = (finalEquity - initialCapital) / initialCapital
  const annualReturn = Math.pow(1 + totalReturn, 1 / years) - 1

  // Sharpe ratio (annualized)
  const meanReturn = mean(returns)
  const stdReturn = stdDev(returns, meanReturn)
  const periodsPerYear = returns.length / years
  const sharpeRatio = stdReturn > 0
    ? (meanReturn / stdReturn) * Math.sqrt(periodsPerYear)
    : 0

  // Sortino ratio (only downside deviation)
  const downsideReturns = returns.filter((r) => r < 0)
  const downsideStd = stdDev(downsideReturns, meanReturn)
  const sortinoRatio = downsideStd > 0
    ? (meanReturn / downsideStd) * Math.sqrt(periodsPerYear)
    : 0

  return { annualReturn, sharpeRatio, sortinoRatio }
}

/**
 * Compute trade statistics from trade history.
 */
function computeTradeStats(trades: TradeRecord[]): {
  winRate: number
  profitFactor: number
  avgTradePnl: number
  bestTrade: number
  worstTrade: number
  maxConsecutiveLosses: number
} {
  if (trades.length === 0) {
    return {
      winRate: 0,
      profitFactor: 0,
      avgTradePnl: 0,
      bestTrade: 0,
      worstTrade: 0,
      maxConsecutiveLosses: 0,
    }
  }

  const wins = trades.filter((t) => t.pnl > 0)
  const losses = trades.filter((t) => t.pnl <= 0)

  const winRate = wins.length / trades.length
  const avgTradePnl = trades.reduce((sum, t) => sum + t.pnl, 0) / trades.length
  const bestTrade = trades.reduce((max, t) => Math.max(max, t.pnl), -Infinity)
  const worstTrade = trades.reduce((min, t) => Math.min(min, t.pnl), Infinity)

  const totalWins = wins.reduce((sum, t) => sum + t.pnl, 0)
  const totalLosses = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0))
  const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0

  // Max consecutive losses
  let maxConsecutiveLosses = 0
  let currentStreak = 0
  for (const trade of trades) {
    if (trade.pnl < 0) {
      currentStreak++
      maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentStreak)
    } else {
      currentStreak = 0
    }
  }

  return { winRate, profitFactor, avgTradePnl, bestTrade, worstTrade, maxConsecutiveLosses }
}

/** Peak equity value */
function computePeakEquity(equityCurve: EquityPoint[]): number {
  let peak = 0
  for (const point of equityCurve) {
    if (point.equity > peak) peak = point.equity
  }
  return peak
}

// --- Math helpers ---

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

function stdDev(values: number[], meanVal: number): number {
  if (values.length < 2) return 0
  const squaredDiffs = values.map((v) => (v - meanVal) ** 2)
  return Math.sqrt(squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length)
}
