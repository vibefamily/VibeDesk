/**
 * ExecutionManager - coordinates order execution across multiple providers.
 *
 * Routes orders to the correct provider and aggregates account/position data.
 */

import type {
  AccountInfo,
  Order,
  OrderRequest,
  Position,
} from '@vibe/shared'
import { eventBus } from '../events/EventBus'
import type { IExecutionManager, IExecutionProvider } from './types'

export class ExecutionManager implements IExecutionManager {
  private providers = new Map<string, IExecutionProvider>()

  registerProvider(provider: IExecutionProvider): void {
    if (this.providers.has(provider.id)) {
      console.warn(`[Execution] Provider '${provider.id}' already registered, overwriting.`)
    }
    this.providers.set(provider.id, provider)

    // Forward provider events to the global event bus
    provider.onOrderUpdate((order) => {
      eventBus.emit({ type: 'order_update', data: order })
    })
    provider.onPositionUpdate((position) => {
      eventBus.emit({ type: 'position_update', data: position })
    })
  }

  getProvider(id: string): IExecutionProvider | undefined {
    return this.providers.get(id)
  }

  async placeOrder(providerId: string, request: OrderRequest): Promise<Order> {
    const provider = this.providers.get(providerId)
    if (!provider) throw new Error(`Execution provider '${providerId}' not found`)
    if (!provider.isConnected) throw new Error(`Execution provider '${providerId}' is not connected`)
    return provider.placeOrder(request)
  }

  async cancelOrder(providerId: string, orderId: string, symbol: string): Promise<Order> {
    const provider = this.providers.get(providerId)
    if (!provider) throw new Error(`Execution provider '${providerId}' not found`)
    return provider.cancelOrder(orderId, symbol)
  }

  async getOpenOrders(providerId?: string): Promise<Order[]> {
    if (providerId) {
      const p = this.providers.get(providerId)
      if (!p) throw new Error(`Execution provider '${providerId}' not found`)
      return p.getOpenOrders()
    }
    const all = await Promise.all(
      this.listProviders().map((p) => p.getOpenOrders().catch(() => [])),
    )
    return all.flat()
  }

  async getPositions(providerId?: string): Promise<Position[]> {
    if (providerId) {
      const p = this.providers.get(providerId)
      if (!p) throw new Error(`Execution provider '${providerId}' not found`)
      return p.getPositions()
    }
    const all = await Promise.all(
      this.listProviders().map((p) => p.getPositions().catch(() => [])),
    )
    return all.flat()
  }

  async getAggregateAccount(): Promise<AccountInfo[]> {
    const accounts = await Promise.all(
      this.listProviders().map((p) => p.getAccountInfo().catch(() => null)),
    )
    return accounts.filter((a): a is AccountInfo => a !== null)
  }

  private listProviders(): IExecutionProvider[] {
    return Array.from(this.providers.values())
  }
}
