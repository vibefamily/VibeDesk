/**
 * Trade Center - multi-source stock price table (module: Trade).
 *
 * One row per tracked stock; columns are the live data sources
 * (Robinhood, Yahoo Finance, Hyperliquid, Binance). Click a row to see
 * the cross-source spread summary and trade action buttons (placeholders
 * - MVP is watch-only). Prices stream from the main process.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { useMarketStore } from '../stores/marketStore'
import { useAgentStore } from '../stores/agentStore'
import { useWindowStore } from '../components/95/windowStore'
import ArcSwapPanel from '../components/ArcSwapPanel'
import PriceChart, { type ChartSeries } from '../components/PriceChart'
import { DEFAULT_STOCK_TICKERS, STOCK_TICKER_NAMES } from '@vibe/shared'

const fmtPrice = (v: number | undefined): string =>
  v == null ? '—' : `$${v.toFixed(2)}`

const fmtSpread = (pct: number | null): string =>
  pct == null ? '—' : `${pct >= 0.3 ? '▲' : ''}${pct.toFixed(2)}%`

const CELL: React.CSSProperties = {
  padding: '3px 10px',
  fontSize: 12,
  whiteSpace: 'nowrap',
  borderBottom: '1px solid #c0c0c0',
}

const CELL_HEAD: React.CSSProperties = {
  ...CELL,
  background: '#c0c0c0',
  fontWeight: 700,
  borderRight: '1px solid #fff',
}


/** Ask AI: find or create a stock-analyst session for this symbol, open
 *  its own chat window and auto-send the analysis question. */
async function askAI(symbol: string): Promise<void> {
  const agentStore = useAgentStore.getState()
  const winStore = useWindowStore.getState()
  await agentStore.refresh()
  const existing = agentStore.agents.find(
    (a) => a.templateId === 'stock-analyst' && a.symbols.join(',') === symbol,
  )
  let id = existing?.id
  if (!id) {
    await agentStore.create({
      templateId: 'stock-analyst',
      name: `${symbol} Analyst`,
      symbols: [symbol],
    })
    await agentStore.refresh()
    id = useAgentStore
      .getState()
      .agents.find((a) => a.templateId === 'stock-analyst' && a.symbols.join(',') === symbol)?.id
  }
  if (!id) return
  winStore.setChatIntent({
    agentId: id,
    templateId: 'stock-analyst',
    question: `Analyze ${symbol} right now: fetch live prices across all sources, compare them, note the cross-source spread, and give a recommendation with reasons and risks.`,
  })
  winStore.openChatWindow(id, `${symbol} Analyst`, '📈')
}

const StockTokens: React.FC = () => {
  const { ready, error, manifests, ticks, unavailable, init, refreshSymbol } = useMarketStore()
  const [selectedTicker, setSelectedTicker] = useState<string>(DEFAULT_STOCK_TICKERS[0] ?? 'TSLA')
  const [arcSwap, setArcSwap] = useState<{ direction: 'buy' | 'sell'; symbol: string } | null>(null)
  const [range, setRange] = useState<'1h' | '1d' | '1w'>('1h')
  const [history, setHistory] = useState<ChartSeries[]>([])

  useEffect(() => {
    void init()
  }, [init])

  useEffect(() => {
    void refreshSymbol(selectedTicker)
  }, [selectedTicker, refreshSymbol])

  // Price history from the local SQLite store (one point per minute).
  const RANGE_SEC: Record<'1h' | '1d' | '1w', number> = { '1h': 3600, '1d': 86_400, '1w': 604_800 }
  const loadHistory = React.useCallback(async (): Promise<void> => {
    try {
      const res = await window.vibeAPI.market.history({
        symbol: selectedTicker,
        from: Math.floor(Date.now() / 1000) - RANGE_SEC[range],
      })
      setHistory(res.map((s) => ({ provider: s.provider, points: s.points })))
    } catch (e) {
      console.warn('[stock] history load failed', e)
    }
  }, [selectedTicker, range])

  useEffect(() => {
    void loadHistory()
    const t = setInterval(() => void loadHistory(), 60_000)
    return () => clearInterval(t)
  }, [loadHistory])

  const providerIds = manifests.map((m) => m.id)

  const rows = useMemo(
    () =>
      DEFAULT_STOCK_TICKERS.map((symbol) => {
        const sourceTicks = ticks[symbol] ?? {}
        const unavailableFor = unavailable[symbol] ?? []
        const prices = providerIds
          .map((id) => ({ id, tick: sourceTicks[id] }))
          .filter((p) => p.tick && !unavailableFor.includes(p.id))
        const values = prices.map((p) => p.tick!.lastPrice).filter((v) => v > 0)
        const low = values.length ? Math.min(...values) : null
        const high = values.length ? Math.max(...values) : null
        const spreadPct = low && high && low > 0 ? ((high - low) / low) * 100 : null
        return { symbol, sourceTicks, unavailableFor, spreadPct, sourceCount: prices.length }
      }),
    [providerIds, ticks, unavailable],
  )

  // Live summary for the selected row.
  const selected = rows.find((r) => r.symbol === selectedTicker)
  const selectedTicks = selected?.sourceTicks ?? {}
  const selectedLive = providerIds.filter(
    (id) => selectedTicks[id] && !(selected?.unavailableFor ?? []).includes(id),
  ).length

  return (
    <div style={{ padding: 10, background: '#fff', minHeight: '100%', boxSizing: 'border-box' }}>
      {/* Header */}
      <div
        style={{
          border: '2px outset',
          borderColor: '#fff #808080 #808080 #fff',
          background: '#c0c0c0',
          padding: '6px 10px',
          marginBottom: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <span style={{ fontSize: 18 }}>📈</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>Stock Prices</div>
          <div style={{ fontSize: 10 }}>
            Same stock across multiple sources · spread = opportunity
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <span
          style={{
            fontSize: 10,
            border: '1px inset',
            borderColor: '#808080 #fff #fff #808080',
            padding: '2px 6px',
            background: '#c0c0c0',
          }}
        >
          {ready ? '● live (main process)' : '○ connecting…'}
        </span>
      </div>

      {error && (
        <div
          style={{
            marginBottom: 8,
            padding: '6px 10px',
            border: '1px inset',
            borderColor: '#808080 #fff #fff #808080',
            fontSize: 11,
            color: '#a00',
          }}
        >
          {error}
        </div>
      )}

      {/* Selected stock action bar */}
      {selected && (
        <div
          style={{
            border: '2px outset',
            borderColor: '#fff #808080 #808080 #fff',
            background: '#c0c0c0',
            padding: '6px 10px',
            marginBottom: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontWeight: 700, fontSize: 14 }}>{selected.symbol}</span>
          <span style={{ fontSize: 11, color: '#333' }}>
            {STOCK_TICKER_NAMES[selected.symbol] ?? ''}
          </span>
          <span
            style={{
              fontSize: 11,
              border: '1px inset',
              borderColor: '#808080 #fff #fff #808080',
              padding: '2px 8px',
              background: '#fff',
            }}
          >
            Spread: {fmtSpread(selected.spreadPct)} ({selected.sourceCount} sources)
          </span>
          <div style={{ flex: 1 }} />
          <button
            style={{ ...winBtn, color: '#008000' }}
            onClick={() => undefined}
            title="Trade execution is a P1 feature; placeholder for the hackathon demo"
          >
            Buy {selected.symbol}
          </button>
          <button style={{ ...winBtn, color: '#a00' }} onClick={() => undefined} title="P1 feature">
            Sell {selected.symbol}
          </button>
          <button
            style={{ ...winBtn, fontWeight: 700 }}
            onClick={() => void askAI(selected.symbol)}
            title="Ask the AI agent to analyze this stock in its own chat window"
          >
            Ask AI
          </button>
        </div>
      )}

      {/* History chart: same symbol across sources on one time axis */}
      <div
        style={{
          border: '2px outset',
          borderColor: '#fff #808080 #808080 #fff',
          background: '#c0c0c0',
          padding: '6px 10px',
          marginBottom: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 12 }}>{selectedTicker} price history</span>
          <span style={{ fontSize: 10, color: '#333' }}>stored locally every minute · SQLite</span>
          <div style={{ flex: 1 }} />
          {(['1h', '1d', '1w'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              style={{
                ...winBtn,
                padding: '2px 10px',
                fontWeight: range === r ? 700 : 500,
                background: range === r ? '#000080' : '#c0c0c0',
                color: range === r ? '#fff' : '#000',
              }}
            >
              {r}
            </button>
          ))}
          <button onClick={() => void loadHistory()} style={{ ...winBtn, padding: '2px 10px' }}>
            Refresh
          </button>
        </div>
        <PriceChart series={history} height={210} />
      </div>

      {/* Price table */}
      <div
        style={{
          border: '2px outset',
          borderColor: '#fff #808080 #808080 #fff',
          overflow: 'auto',
          background: '#fff',
        }}
      >
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
          <thead>
            <tr>
              <th style={CELL_HEAD}>Symbol</th>
              <th style={CELL_HEAD}>Name</th>
              {manifests.map((m) => (
                <th key={m.id} style={CELL_HEAD}>
                  {m.name}
                  <div style={{ fontSize: 9, fontWeight: 400, color: '#333' }}>
                    {m.assetScope === 'crypto'
                      ? 'crypto only'
                      : m.assetScope === 'stocks'
                        ? 'stocks'
                        : m.assetScope}
                  </div>
                </th>
              ))}
              <th style={CELL_HEAD}>Spread</th>
              <th style={CELL_HEAD}>Live</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isSelected = row.symbol === selectedTicker
              const liveCount = providerIds.filter(
                (id) => row.sourceTicks[id] && !row.unavailableFor.includes(id),
              ).length
              return (
                <tr
                  key={row.symbol}
                  onClick={() => setSelectedTicker(row.symbol)}
                  style={{
                    cursor: 'pointer',
                    background: isSelected ? '#000080' : 'transparent',
                    color: isSelected ? '#fff' : '#000',
                  }}
                >
                  <td style={{ ...CELL, fontWeight: 700, borderRight: '1px solid #c0c0c0' }}>
                    {row.symbol}
                  </td>
                  <td style={{ ...CELL, color: isSelected ? '#ddd' : '#333', borderRight: '1px solid #c0c0c0' }}>
                    {STOCK_TICKER_NAMES[row.symbol] ?? ''}
                  </td>
                  {providerIds.map((id) => {
                    const tick = row.sourceTicks[id]
                    const isUnavailable = row.unavailableFor.includes(id) || !tick
                    return (
                      <td key={id} style={{ ...CELL, textAlign: 'right', borderRight: '1px solid #c0c0c0' }}>
                        {isUnavailable ? (
                          <span style={{ fontSize: 10, fontStyle: 'italic', color: isSelected ? '#aaa' : '#999' }}>
                            n/a
                          </span>
                        ) : (
                          fmtPrice(tick!.lastPrice)
                        )}
                      </td>
                    )
                  })}
                  <td
                    style={{
                      ...CELL,
                      textAlign: 'right',
                      color:
                        row.spreadPct != null && row.spreadPct >= 0.3
                          ? isSelected
                            ? '#ffe14d'
                            : '#008000'
                          : isSelected
                            ? '#ddd'
                            : '#555',
                      fontWeight: row.spreadPct != null && row.spreadPct >= 0.3 ? 700 : 400,
                    }}
                  >
                    {fmtSpread(row.spreadPct)}
                  </td>
                  <td style={{ ...CELL, textAlign: 'center' }}>{liveCount}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 10, color: '#555', marginTop: 6, lineHeight: 1.5 }}>
        Prices refresh every 15s from the main process · {selectedLive} live source(s) for{' '}
        {selectedTicker} · <span style={{ fontStyle: 'italic' }}>n/a</span> = source has no quote
        for this symbol (Hyperliquid lists crypto only; Binance stock symbols like{' '}
        {selectedTicker}BUSDT are free, an API key unlocks account-level data)
      </div>

      <ArcSwapPanel
        open={arcSwap !== null}
        direction={arcSwap?.direction ?? 'buy'}
        symbol={arcSwap?.symbol ?? ''}
        onClose={() => setArcSwap(null)}
      />
    </div>
  )
}

const winBtn: React.CSSProperties = {
  padding: '4px 12px',
  fontSize: 11,
  background: '#c0c0c0',
  border: '2px outset',
  borderColor: '#fff #808080 #808080 #fff',
  cursor: 'pointer',
  fontWeight: 500,
}

export default StockTokens
