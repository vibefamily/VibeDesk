/**
 * Market data bridge for the Electron main process.
 *
 * Data sources run HERE (Node fetch / WebSocket), which eliminates the
 * renderer CORS errors seen with Robinhood / Yahoo in the browser. The
 * main process polls every tracked symbol and pushes live ticks to all
 * renderer windows over 'market:ticks'. The agent system shares the
 * same aggregator instance.
 */

import { ipcMain, webContents } from 'electron'
import { createDefaultDataSources } from '@vibe/data-sources'
import type { DefaultDataSources } from '@vibe/data-sources'
import { DEFAULT_STOCK_TICKERS } from '@vibe/shared'
import type { TickData } from '@vibe/shared'

const POLL_MS = 15_000
const CONCURRENCY = 4

let dataSourcesPromise: Promise<DefaultDataSources> | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null
/** Guards against overlapping snapshot rounds (snapshot can outlast POLL_MS). */
let snapshotting = false

export function getMarketDataSources(): Promise<DefaultDataSources> {
  if (!dataSourcesPromise) {
    dataSourcesPromise = createDefaultDataSources()
  }
  return dataSourcesPromise
}

export async function getMarketAggregator() {
  return (await getMarketDataSources()).aggregator
}

interface MarketSnapshot {
  ticks: Record<string, Record<string, TickData>>
  unavailable: Record<string, string[]>
  lastUpdated: number
}

async function snapshotSymbol(
  symbol: string,
): Promise<{ ticks: Record<string, TickData>; unavailable: string[] }> {
  const { aggregator } = await getMarketDataSources()
  const ticks: Record<string, TickData> = {}
  const failed: string[] = []
  try {
    const all = await aggregator.getTicksAll(symbol)
    for (const provider of aggregator.listProviders()) {
      const tick = all.get(provider.id)
      if (tick) {
        ticks[provider.id] = tick
      } else {
        failed.push(provider.id)
      }
    }
  } catch {
    // A symbol-level failure just yields no ticks this round.
  }
  return { ticks, unavailable: failed }
}

async function takeSnapshot(symbols?: string[]): Promise<MarketSnapshot> {
  const list = symbols && symbols.length > 0 ? symbols : [...DEFAULT_STOCK_TICKERS]
  const ticks: Record<string, Record<string, TickData>> = {}
  const unavailable: Record<string, string[]> = {}

  // Snapshot symbols with limited concurrency to stay gentle on the
  // free public endpoints (Robinhood / Yahoo).
  for (let i = 0; i < list.length; i += CONCURRENCY) {
    const batch = list.slice(i, i + CONCURRENCY)
    const results = await Promise.all(batch.map((s) => snapshotSymbol(s)))
    results.forEach((result, j) => {
      ticks[batch[j]!] = result.ticks
      unavailable[batch[j]!] = result.unavailable
    })
  }

  return { ticks, unavailable, lastUpdated: Date.now() }
}

/** One snapshot round; skips if the previous round is still running. */
async function pollOnce(): Promise<void> {
  if (snapshotting) return
  snapshotting = true
  try {
    const snap = await takeSnapshot().catch(() => null)
    if (snap) {
      const count = Object.values(snap.ticks).reduce(
        (sum, t) => sum + Object.keys(t).length,
        0,
      )
      console.log(`[market] poll round: ${count} live ticks`)
      broadcast(snap)
    } else {
      console.warn('[market] poll round failed; retrying next interval')
    }
  } finally {
    snapshotting = false
  }
}

function broadcast(snapshot: MarketSnapshot): void {
  for (const wc of webContents.getAllWebContents()) {
    wc.send('market:ticks', snapshot)
  }
}

/** Wire up market IPC + start the polling loop. */
export function setupMarketIpc(): void {
  ipcMain.handle('market:getState', async () => {
    const ds = await getMarketDataSources()
    const manifests = ds.registry.list().map((e) => e.manifest)
    // Kick off an immediate snapshot round; prices stream in over
    // 'market:ticks' within a few seconds.
    void pollOnce()
    return { ready: true, manifests, ticks: {}, unavailable: {}, lastUpdated: Date.now() }
  })

  ipcMain.handle('market:refreshSymbol', async (_e, symbol: string) => {
    const result = await snapshotSymbol(String(symbol).toUpperCase())
    const snap: MarketSnapshot = {
      ticks: { [String(symbol).toUpperCase()]: result.ticks },
      unavailable: { [String(symbol).toUpperCase()]: result.unavailable },
      lastUpdated: Date.now(),
    }
    broadcast(snap)
    return snap
  })

  if (!pollTimer) {
    pollTimer = setInterval(() => {
      void pollOnce()
    }, POLL_MS)
  }
}

/** Stop the polling loop (called on app quit). */
export function stopMarketPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}
