/**
 * Strategy registry - manages available strategies.
 *
 * Strategies can be registered at startup or dynamically via plugins.
 */

import type { StrategyClass, StrategyContext, OrderExecutor } from '../strategy/Strategy'
import { Strategy } from '../strategy/Strategy'
import type { StrategyInfo } from '@vibe/shared'

/**
 * Registry for trading strategies.
 *
 * Use `register()` to add strategies and `create()` to instantiate them.
 */
export class StrategyRegistry {
  private strategies = new Map<string, StrategyClass>()
  private infos = new Map<string, StrategyInfo>()

  /**
   * Register a strategy class.
   */
  register(strategyClass: StrategyClass, info: StrategyInfo): void {
    this.strategies.set(info.id, strategyClass)
    this.infos.set(info.id, info)
  }

  /**
   * Get strategy info by ID.
   */
  getInfo(id: string): StrategyInfo | undefined {
    return this.infos.get(id)
  }

  /**
   * List all registered strategies.
   */
  list(): StrategyInfo[] {
    return Array.from(this.infos.values())
  }

  /**
   * Create a strategy instance by ID.
   */
  create(id: string): Strategy | null {
    const cls = this.strategies.get(id)
    if (!cls) return null
    return new cls()
  }

  /**
   * Check if a strategy is registered.
   */
  has(id: string): boolean {
    return this.strategies.has(id)
  }
}

/** Global strategy registry singleton */
export const strategyRegistry = new StrategyRegistry()
