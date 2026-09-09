/**
 * EventBus - typed pub/sub for the Vibe trading system.
 *
 * The event bus is the central nervous system of the application.
 * All components communicate through events rather than direct coupling,
 * which makes the system modular and easy to extend with plugins.
 */

import type { SystemEvent } from '@vibe/shared'

type EventHandler<T = SystemEvent> = (event: T) => void | Promise<void>

/**
 * A simple typed event bus supporting async handlers.
 *
 * Events are dispatched synchronously but handlers may be async.
 * Use `emitAsync` if you need to wait for all handlers to complete.
 */
export class EventBus {
  private handlers = new Map<string, Set<EventHandler<SystemEvent>>>()
  private wildcardHandlers = new Set<EventHandler<SystemEvent>>()

  /**
   * Subscribe to a specific event type.
   * Returns an unsubscribe function.
   */
  on<T extends SystemEvent['type']>(
    type: T,
    handler: EventHandler<Extract<SystemEvent, { type: T }>>,
  ): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set())
    }
    this.handlers.get(type)!.add(handler as EventHandler<SystemEvent>)
    return () => this.off(type, handler as EventHandler<SystemEvent>)
  }

  /**
   * Subscribe to all events (wildcard).
   */
  onAll(handler: EventHandler<SystemEvent>): () => void {
    this.wildcardHandlers.add(handler)
    return () => this.wildcardHandlers.delete(handler)
  }

  /**
   * Unsubscribe from an event type.
   */
  off(type: string, handler: EventHandler<SystemEvent>): void {
    this.handlers.get(type)?.delete(handler)
  }

  /**
   * Emit an event synchronously (fire-and-forget).
   */
  emit(event: SystemEvent): void {
    // Wildcard handlers
    for (const handler of this.wildcardHandlers) {
      this.safeInvoke(handler, event)
    }
    // Typed handlers
    const typeHandlers = this.handlers.get(event.type)
    if (typeHandlers) {
      for (const handler of typeHandlers) {
        this.safeInvoke(handler, event)
      }
    }
  }

  /**
   * Emit an event and wait for all async handlers to complete.
   */
  async emitAsync(event: SystemEvent): Promise<void> {
    const promises: Promise<void>[] = []

    for (const handler of this.wildcardHandlers) {
      const result = handler(event)
      if (result instanceof Promise) promises.push(result)
    }

    const typeHandlers = this.handlers.get(event.type)
    if (typeHandlers) {
      for (const handler of typeHandlers) {
        const result = handler(event)
        if (result instanceof Promise) promises.push(result)
      }
    }

    await Promise.all(promises)
  }

  /**
   * Remove all handlers.
   */
  clear(): void {
    this.handlers.clear()
    this.wildcardHandlers.clear()
  }

  private safeInvoke(handler: EventHandler<SystemEvent>, event: SystemEvent): void {
    try {
      const result = handler(event)
      if (result instanceof Promise) {
        result.catch((err) => {
          console.error('[EventBus] async handler error:', err)
        })
      }
    } catch (err) {
      console.error('[EventBus] handler error:', err)
    }
  }
}

/** Global event bus singleton */
export const eventBus = new EventBus()
