/**
 * Portfolio management module.
 *
 * Tracks aggregate positions, equity, and PnL across all accounts.
 */

import type { Balance, Position } from '@vibe/shared'

/** Portfolio summary */
export interface PortfolioSummary {
  totalEquity: number
  totalPnl: number
  totalPnlPercent: number
  positions: Position[]
  balances: Balance[]
  updatedAt: number
}

/**
 * Portfolio - tracks aggregate holdings and performance.
 */
export class Portfolio {
  private positions = new Map<string, Position>()
  private balances = new Map<string, Balance>()
  private peakEquity = 0

  /** Update a position */
  updatePosition(position: Position): void {
    const key = `${position.exchange}:${position.symbol}`
    this.positions.set(key, position)
  }

  /** Update a balance */
  updateBalance(balance: Balance): void {
    const key = `${balance.exchange}:${balance.asset}`
    this.balances.set(key, balance)
  }

  /** Get all positions */
  getPositions(): Position[] {
    return Array.from(this.positions.values())
  }

  /** Get all balances */
  getBalances(): Balance[] {
    return Array.from(this.balances.values())
  }

  /**
   * Calculate total portfolio equity in USD.
   * Note: relies on balance.usdValue and position.notional being populated.
   */
  getTotalEquity(): number {
    let total = 0
    for (const balance of this.balances.values()) {
      total += balance.usdValue ?? 0
    }
    for (const position of this.positions.values()) {
      total += position.notional ?? 0
    }
    return total
  }

  /** Get portfolio summary */
  getSummary(): PortfolioSummary {
    const equity = this.getTotalEquity()
    if (equity > this.peakEquity) this.peakEquity = equity

    const positions = this.getPositions()
    const totalPnl = positions.reduce((sum, p) => sum + (p.unrealizedPnl ?? 0), 0)
    const totalPnlPercent = equity > 0 ? totalPnl / equity : 0

    return {
      totalEquity: equity,
      totalPnl,
      totalPnlPercent,
      positions,
      balances: this.getBalances(),
      updatedAt: Date.now(),
    }
  }

  /** Get peak equity for drawdown calculations */
  getPeakEquity(): number {
    return this.peakEquity
  }
}
