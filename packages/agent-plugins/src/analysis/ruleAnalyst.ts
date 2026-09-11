/**
 * Deterministic rule-based stock analysis.
 *
 * Used as a no-API-key fallback so the demo always produces a real,
 * explainable analysis from live multi-source prices. With an LLM key
 * configured, the same input is handed to the model instead; both paths
 * share the same output shape.
 */

import type { TickData } from '@vibe/shared'

/** Structured analysis output shown to the user. */
export interface StockAnalysis {
  symbol: string
  action: 'BUY' | 'SELL' | 'HOLD'
  /** 0-1 confidence */
  confidence: number
  summary: string
  reasons: string[]
  risks: string[]
  /** Cross-source spread in percent */
  spreadPct: number | null
  /** 24h change in percent (from the first available source) */
  change24hPct: number | null
  /** Number of live price sources observed */
  sourceCount: number
  analyzedAt: number
}

/** Spread threshold (percent) that flags an arbitrage-watch signal. */
export const SPREAD_WATCH_THRESHOLD_PCT = 0.3
/** 24h move threshold (percent) for momentum signals. */
export const MOVE_WATCH_THRESHOLD_PCT = 2.5

/**
 * Analyze one symbol from all available source ticks.
 *
 * @param symbol   Ticker, e.g. 'TSLA'
 * @param ticks    providerId -> latest tick (only live sources)
 */
export function analyzeStock(symbol: string, ticks: Map<string, TickData>): StockAnalysis {
  const sources = Array.from(ticks.values()).filter((t) => t.lastPrice > 0)
  const now = Date.now()

  if (sources.length === 0) {
    return {
      symbol,
      action: 'HOLD',
      confidence: 0.3,
      summary: `No live price sources for ${symbol}.`,
      reasons: ['All configured sources are unavailable for this symbol.'],
      risks: ['Cannot assess the market without price data.'],
      spreadPct: null,
      change24hPct: null,
      sourceCount: 0,
      analyzedAt: now,
    }
  }

  const prices = sources.map((t) => t.lastPrice)
  const low = Math.min(...prices)
  const high = Math.max(...prices)
  const spreadPct = low > 0 ? ((high - low) / low) * 100 : 0
  const primary = sources[0]!
  const change24hPct = primary.change24h != null ? primary.change24h * 100 : null

  const reasons: string[] = []
  const risks: string[] = []
  const summaryParts: string[] = []

  summaryParts.push(
    `${sourceCountLabel(sources.length)} live sources: ${prices
      .map((p) => `$${p.toFixed(2)}`)
      .join(' / ')}`,
  )
  if (sources.length > 1) {
    summaryParts.push(`spread ${spreadPct.toFixed(2)}%`)
  }
  if (change24hPct != null) {
    summaryParts.push(`24h ${change24hPct >= 0 ? '+' : ''}${change24hPct.toFixed(2)}%`)
  }

  let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD'
  let confidence = 0.5

  // Cross-source divergence: the core VibeDesk signal.
  if (sources.length > 1 && spreadPct >= SPREAD_WATCH_THRESHOLD_PCT) {
    reasons.push(
      `Cross-source spread is ${spreadPct.toFixed(2)}% — the highest and lowest venues disagree by more than the watch threshold.`,
    )
    reasons.push(`Cheapest venue: $${low.toFixed(2)}. Most expensive venue: $${high.toFixed(2)}.`)
    reasons.push('In a live product this is the candidate for an arbitrage-aware strategy.')
    risks.push('A wide spread may reflect stale quotes or thin venues, not a real edge.')
    action = 'HOLD'
    confidence = 0.6
  } else if (sources.length > 1) {
    reasons.push(
      `Cross-source spread is ${spreadPct.toFixed(2)}% — venues agree closely.`,
    )
  }

  // Momentum read from 24h change.
  if (change24hPct != null) {
    if (change24hPct >= MOVE_WATCH_THRESHOLD_PCT) {
      reasons.push(
        `Strong upward momentum: +${change24hPct.toFixed(2)}% over 24h.`,
      )
      risks.push('Chasing strength risks buying near a short-term top; expect pullbacks.')
      action = change24hPct >= MOVE_WATCH_THRESHOLD_PCT * 2 ? 'HOLD' : 'BUY'
      confidence = 0.55
    } else if (change24hPct <= -MOVE_WATCH_THRESHOLD_PCT) {
      reasons.push(
        `Downward pressure: ${change24hPct.toFixed(2)}% over 24h.`,
      )
      risks.push('A falling market can fall further; do not catch a falling knife without a stop.')
      action = change24hPct <= -MOVE_WATCH_THRESHOLD_PCT * 2 ? 'HOLD' : 'SELL'
      confidence = 0.55
    } else {
      reasons.push(
        `24h change ${change24hPct >= 0 ? '+' : ''}${change24hPct.toFixed(2)}% is within the neutral band.`,
      )
    }
  }

  const summary = `${symbol}: ${action} (${summaryParts.join(' · ')})`
  return {
    symbol,
    action,
    confidence,
    summary,
    reasons,
    risks,
    spreadPct: sources.length > 1 ? spreadPct : null,
    change24hPct,
    sourceCount: sources.length,
    analyzedAt: now,
  }
}

function sourceCountLabel(count: number): string {
  return count === 1 ? '1 source' : `${count} sources`
}
