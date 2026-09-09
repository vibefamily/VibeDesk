/**
 * Execution engine interfaces.
 *
 * The execution layer abstracts order placement, cancellation, and
 * status tracking across multiple exchanges and chains.
 */

import type {
  AccountInfo,
  Order,
  OrderRequest,
  Position,
} from '@vibe/shared'

/**
 * Execution provider interface.
 *
 * Each exchange / broker / DEX implements this interface so that
 * order placement and position management works uniformly.
 */
export interface IExecutionProvider {
  /** Provider identifier (e.g., 'binance', 'solana-dex') */
  readonly id: string
  /** Whether the provider is connected and ready */
  readonly isConnected: boolean

  connect(): Promise<void>
  disconnect(): Promise<void>

  // --- Orders ---
  placeOrder(request: OrderRequest): Promise<Order>
  cancelOrder(orderId: string, symbol: string): Promise<Order>
  getOrder(orderId: string, symbol: string): Promise<Order | null>
  getOpenOrders(symbol?: string): Promise<Order[]>
  getOrderHistory(symbol?: string, limit?: number): Promise<Order[]>

  // --- Account ---
  getAccountInfo(): Promise<AccountInfo>
  getPositions(symbol?: string): Promise<Position[]>

  // --- Real-time updates ---
  onOrderUpdate(callback: (order: Order) => void): () => void
  onPositionUpdate(callback: (position: Position) => void): () => void
}

/**
 * Execution manager - coordinates multiple execution providers.
 */
export interface IExecutionManager {
  registerProvider(provider: IExecutionProvider): void
  getProvider(id: string): IExecutionProvider | undefined

  placeOrder(providerId: string, request: OrderRequest): Promise<Order>
  cancelOrder(providerId: string, orderId: string, symbol: string): Promise<Order>
  getOpenOrders(providerId?: string): Promise<Order[]>
  getPositions(providerId?: string): Promise<Position[]>

  /** Get aggregate account info across all providers */
  getAggregateAccount(): Promise<AccountInfo[]>
}
