/**
 * Vibe Core - trading system core package.
 *
 * Provides the foundational modules:
 * - events:    typed event bus for inter-module communication
 * - market:    market data aggregation and provider interfaces
 * - execution: order execution and account management
 * - wallet:    wallet creation, import, and signing
 * - risk:      risk management and trade validation
 * - portfolio: aggregate position and equity tracking
 * - config:    application configuration management
 */

export * from './events'
export * from './market'
export * from './execution'
export * from './wallet'
export * from './risk'
export * from './portfolio'
export * from './config'
