/**
 * WebSocket manager with auto-reconnection and subscription management.
 *
 * All data source providers that use this for real-time data streams.
 * Supports exponential backoff reconnection and multiplexed subscriptions.
 */

interface WebSocketSubscription {
  channel: string
  callbacks: Set<(data: unknown) => void>
}

/**
 * Reconnecting WebSocket client with exponential backoff.
 */
export class WebSocketManager {
  private url: string
  private ws: WebSocket | null = null
  private subscriptions = new Map<string, WebSocketSubscription>()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private reconnectDelay = 1000
  private shouldReconnect = true
  private openResolver: (() => void) | null = null
  private onOpenCallbacks: (() => void) | null = null

  constructor(url: string) {
    this.url = url
  }

  /**
   * Connect to the WebSocket server. */
  async connect(): Promise<void> {
    this.shouldReconnect = true
    await this.doConnect()
    return new Promise((resolve) => {
      this.openResolver = resolve
    })
  }

  private doConnect(): void {
    if (typeof window !== 'undefined' && 'WebSocket' in window) {
      this.ws = new window.WebSocket(this.url)
    } else {
      // Node.js: use a dynamic import for ws module if available
      // Fallback: try globalThis.WebSocket (Node 22+)
      const WS = (globalThis as unknown as { WebSocket?: typeof WebSocket }).WebSocket
      if (WS) {
        this.ws = new WS(this.url)
      } else {
        throw new Error('WebSocket not available in this environment')
      }
    }

    this.ws.onopen = () => {
      this.reconnectAttempts = 0
      if (this.openResolver) {
        this.openResolver()
        this.openResolver = null
      }
      if (this.onOpenCallbacks) {
        this.onOpenCallbacks()
      }
      // Re-subscribe to all channels after reconnect
      this.resubscribeAll()
    }

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data)
        this.handleMessage(data)
      } catch {
          // Non-JSON messages are ignored
        }
    }

    this.ws.onclose = () => {
      this._isConnected = false
      if (this.shouldReconnect) {
        this.scheduleReconnect()
      }
    }

    this.ws.onerror = () => {
      // Error will trigger onclose, which handles reconnection
    }
  }

  private _isConnected = false

  get isConnected(): boolean {
    return this._isConnected && this.ws?.readyState === WebSocket.OPEN
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WebSocket] Max reconnect attempts reached')
      return
    }
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts)
    this.reconnectAttempts++
    console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)
    setTimeout(() => this.doConnect(), delay)
  }

  /**
   * Register a callback for a channel.
   * Returns an unsubscribe function.
   */
  subscribe(channel: string, callback: (data: unknown) => void): () => void {
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, { channel, callbacks: new Set() })
      this.sendSubscribe(channel)
    }
    this.subscriptions.get(channel)!.callbacks.add(callback)

    return () => {
      const sub = this.subscriptions.get(channel)
      if (sub) {
        sub.callbacks.delete(callback)
        if (sub.callbacks.size === 0) {
          this.sendUnsubscribe(channel)
          this.subscriptions.delete(channel)
        }
      }
    }
  }

  /**
   * Resolve a subscription by channel key. Subclasses use this when
   * routing protocol-specific push messages to callbacks.
   */
  protected getSubscription(channel: string): WebSocketSubscription | undefined {
    return this.subscriptions.get(channel)
  }

  /**
   * Send a JSON message over the WebSocket.
   */
  send(data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    }
  }

  /**
   * Disconnect from the WebSocket server.
   */
  disconnect(): void {
    this.shouldReconnect = false
    this.ws?.close()
    this.ws = null
    this.subscriptions.clear()
  }

  /**
   * Called when the connection opens - override in subclasses to handle specific message formats.
   */
  protected handleMessage(data: unknown): void {
    // Default: dispatch by channel if data has an e/
    const msg = data as { e?: string; data?: unknown }
    if (msg.e && msg.data !== undefined) {
      const sub = this.subscriptions.get(msg.e)
      if (sub) {
        for (const cb of sub.callbacks) {
          cb(msg.data)
        }
      }
    }
  }

  /**
   * Send a subscribe message - override in subclasses for specific protocol.
   */
  protected sendSubscribe(channel: string): void {
    this.send({ method: 'SUBSCRIBE', params: [channel], id: Date.now() })
  }

  /**
   * Send an unsubscribe message - override in subclasses for specific protocol.
   */
  protected sendUnsubscribe(channel: string): void {
    this.send({ method: 'UNSUBSCRIBE', params: [channel], id: Date.now() })
  }

  private resubscribeAll(): void {
    for (const channel of this.subscriptions.keys()) {
      this.sendSubscribe(channel)
    }
  }
}
