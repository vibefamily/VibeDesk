/**
 * Vibe Core - trading system core package.
 *
 * Provides the foundational modules:
 * - events:    typed event bus for inter-module communication
 * - market:    market data aggregation and provider interfaces
 * - execution: order execution and account management
 * - risk:      risk management and trade validation
 * - portfolio: aggregate position and equity tracking
 * - config:    application configuration management
 *
 * NOTE: the wallet module is intentionally NOT re-exported here. It is
 * main-process-only (node:fs encrypted vault) and available via the
 * '@vibe/core/wallet' subpath, so importing '@vibe/core' in the renderer
 * never pulls node built-ins into the browser bundle.
 */

export * from './events'
export * from './market'
export * from './execution'
export * from './risk'
export * from './portfolio'
export * from './config'
