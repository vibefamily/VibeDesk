/**
 * Hyperliquid WebSocket manager.
 *
 * Adapts the generic WebSocketManager to Hyperliquid's subscription
 * protocol:
 *
 *   Subscribe:   {"method":"subscribe","subscription":{...}}
 *   Push:        {"channel":"allMids","data":{...}}
 *
 * Channel keys use a colon-delimited scheme so the provider can route
 * pushes back to the right subscription:
 *   "allMids", "l2Book:BTC", "candle:BTC:1h", "trades:BTC"
 */

import { WebSocketManager } from '../common/websocket'

type SubscriptionObject = { type: string; coin?: string; interval?: string }

function parseKey(key: string): SubscriptionObject {
  const parts = key.split(':')
  const type = parts[0]!
  const sub: SubscriptionObject = { type }
  if (type === 'l2Book' || type === 'trades') {
    sub.coin = parts[1]
  } else if (type === 'candle') {
    sub.coin = parts[1]
    sub.interval = parts[2]
  }
  return sub
}

export class HyperliquidWebSocketManager extends WebSocketManager {
  protected override sendSubscribe(channel: string): void {
    this.send({ method: 'subscribe', subscription: parseKey(channel) })
  }

  protected override sendUnsubscribe(channel: string): void {
    this.send({ method: 'unsubscribe', subscription: parseKey(channel) })
  }

  protected override handleMessage(data: unknown): void {
    const msg = data as { channel?: string; data?: unknown }
    if (!msg.channel || msg.data === undefined) {
      return
    }
    const payload = msg.data as { coin?: string; i?: string }
    let key = msg.channel
    if ((msg.channel === 'l2Book' || msg.channel === 'trades') && payload?.coin) {
      key = `${msg.channel}:${payload.coin}`
    } else if (msg.channel === 'candle' && payload?.coin) {
      key = `${msg.channel}:${payload.coin}:${payload.i ?? '1h'}`
    }
    const sub = this.getSubscription(key)
    if (sub) {
      for (const cb of sub.callbacks) {
        cb(msg.data)
      }
    }
  }
}
