/**
 * Risk management module.
 *
 * Enforces trading limits, stop-loss, and other risk controls
 * before orders are sent to execution.
 */

import type { OrderRequest } from '@vibe/shared'

/** Risk check result */
export interface RiskCheckResult {
  passed: boolean
  reason?: string
  severity: 'warning' | 'error' | 'block'
}

/** Risk configuration */
export interface RiskConfig {
  /** Maximum single order value in USD */
  maxOrderValue: number
  /** Maximum daily trading volume in USD */
  maxDailyVolume: number
  /** Maximum position size per symbol (% of portfolio) */
  maxPositionPercent: number
  /** Whether to require human approval for all trades */
  requireHumanApproval: boolean
  /** Confidence threshold for auto-execution (0-1) */
  autoExecConfidenceThreshold: number
  /** Maximum drawdown allowed (% of peak equity) */
  maxDrawdownPercent: number
  /** Whitelist of symbols that can be traded */
  allowedSymbols?: string[]
  /** Blacklist of symbols that cannot be traded */
  blockedSymbols?: string[]
}

const DEFAULT_RISK_CONFIG: RiskConfig = {
  maxOrderValue: 1000,
  maxDailyVolume: 5000,
  maxPositionPercent: 0.1, // 10%
  requireHumanApproval: true,
  autoExecConfidenceThreshold: 0.9,
  maxDrawdownPercent: 0.2, // 20%
}

/**
 * RiskEngine - validates orders against risk rules.
 *
 * This is a critical safeguard that runs before any order reaches execution.
 * It can block orders that violate risk limits and warn about edge cases.
 */
export class RiskEngine {
  private config: RiskConfig
  private dailyVolume = 0
  private dayStart = this.startOfDay()

  constructor(config: Partial<RiskConfig> = {}) {
    this.config = { ...DEFAULT_RISK_CONFIG, ...config }
  }

  /** Update risk configuration */
  updateConfig(config: Partial<RiskConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /** Get current risk config */
  getConfig(): RiskConfig {
    return { ...this.config }
  }

  /**
   * Check whether an order passes risk rules.
   * Returns an array of results (one per rule).
   */
  checkOrder(request: OrderRequest, estimatedValue?: number): RiskCheckResult[] {
    const results: RiskCheckResult[] = []

    // Reset daily volume if a new day has started
    this.rolloverDayIfNeeded()

    // Order size check
    if (estimatedValue !== undefined && estimatedValue > this.config.maxOrderValue) {
      results.push({
        passed: false,
        severity: 'block',
        reason: `Order value $${estimatedValue.toFixed(2)} exceeds max order value $${this.config.maxOrderValue.toFixed(2)}`,
      })
    }

    // Daily volume check
    if (estimatedValue !== undefined) {
      const projectedDaily = this.dailyVolume + estimatedValue
      if (projectedDaily > this.config.maxDailyVolume) {
        results.push({
          passed: false,
          severity: 'block',
          reason: `Order would push daily volume to $${projectedDaily.toFixed(2)}, exceeding limit $${this.config.maxDailyVolume.toFixed(2)}`,
        })
      }
    }

    // Symbol blacklist check
    if (this.config.blockedSymbols?.includes(request.symbol)) {
      results.push({
        passed: false,
        severity: 'block',
        reason: `Symbol ${request.symbol} is blocked`,
      })
    }

    // Symbol whitelist check
    if (this.config.allowedSymbols && !this.config.allowedSymbols.includes(request.symbol)) {
      results.push({
        passed: false,
        severity: 'block',
        reason: `Symbol ${request.symbol} is not in the allowed list`,
      })
    }

    // If nothing failed, mark as passed
    if (results.length === 0) {
      results.push({ passed: true, severity: 'warning' })
    }

    return results
  }

  /**
   * Check if an agent proposal should require human approval.
   */
  requiresHumanApproval(confidence: number): boolean {
    if (this.config.requireHumanApproval) return true
    return confidence < this.config.autoExecConfidenceThreshold
  }

  /**
   * Record a completed trade's volume for daily limit tracking.
   */
  recordTradeVolume(value: number): void {
    this.rolloverDayIfNeeded()
    this.dailyVolume += value
  }

  /**
   * Check drawdown against max drawdown limit.
   */
  checkDrawdown(currentEquity: number, peakEquity: number): RiskCheckResult {
    const drawdown = (peakEquity - currentEquity) / peakEquity
    if (drawdown > this.config.maxDrawdownPercent) {
      return {
        passed: false,
        severity: 'block',
        reason: `Drawdown ${(drawdown * 100).toFixed(2)}% exceeds max ${(this.config.maxDrawdownPercent * 100).toFixed(2)}%`,
      }
    }
    return { passed: true, severity: 'warning' }
  }

  private rolloverDayIfNeeded(): void {
    const now = this.startOfDay()
    if (now > this.dayStart) {
      this.dailyVolume = 0
      this.dayStart = now
    }
  }

  private startOfDay(): number {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }
}
