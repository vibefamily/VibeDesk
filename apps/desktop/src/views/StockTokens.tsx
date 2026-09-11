/**
 * Stock Tokens view - multi-source stock price comparison.
 *
 * The core showcase screen: pick a stock ticker, see live prices from
 * every registered data source side by side (Robinhood, Yahoo Finance,
 * Hyperliquid, Binance), with cross-source spread, unavailable-source
 * fallback and placeholder trading / AI actions.
 *
 * All prices are real data from the public endpoints; sources that do
 * not list the asset render as "Unavailable".
 */

import React, { useEffect, useMemo, useState } from 'react'
import { DEFAULT_STOCK_TICKERS, STOCK_TICKER_NAMES } from '@vibe/shared'
import type { TickData } from '@vibe/shared'
import { useMarketStore } from '../stores/marketStore'

const KIND_LABEL: Record<string, string> = {
  broker: 'Broker',
  aggregator: 'Aggregator',
  dex: 'DEX',
  cex: 'CEX',
  chain: 'Chain',
}

const KIND_COLOR: Record<string, string> = {
  broker: '#58a6ff',
  aggregator: '#d29922',
  dex: '#bc8cff',
  cex: '#f85149',
  chain: '#3fb950',
}

interface SourceCard {
  id: string
  name: string
  kind: string
  updateMode: string[]
  tick?: TickData
  unavailable: boolean
}

const StockTokens: React.FC = () => {
  const [selectedTicker, setSelectedTicker] = useState<string>(DEFAULT_STOCK_TICKERS[0] ?? 'TSLA')
  const { ready, error, manifests, ticks, unavailable, init, refreshSymbol } = useMarketStore()

  useEffect(() => {
    void init()
  }, [init])

  useEffect(() => {
    void refreshSymbol(selectedTicker)
  }, [selectedTicker, refreshSymbol])

  const sources = useMemo<SourceCard[]>(() => {
    if (manifests.length === 0) {
      return []
    }
    const symbolTicks = ticks[selectedTicker] ?? {}
    const symbolUnavailable = unavailable[selectedTicker] ?? []
    return manifests.map((manifest) => ({
      id: manifest.id,
      name: manifest.name,
      kind: manifest.kind,
      updateMode: manifest.updateMode,
      tick: symbolTicks[manifest.id],
      unavailable: symbolUnavailable.includes(manifest.id) && !symbolTicks[manifest.id],
    }))
  }, [manifests, ticks, unavailable, selectedTicker])

  const pricedSources = sources.filter((s) => s.tick)
  const minTick = pricedSources.reduce<TickData | null>(
    (min, s) => (min === null || (s.tick!.lastPrice < min.lastPrice) ? s.tick! : min),
    null,
  )
  const maxTick = pricedSources.reduce<TickData | null>(
    (max, s) => (max === null || (s.tick!.lastPrice > max.lastPrice) ? s.tick! : max),
    null,
  )
  const spread = minTick && maxTick ? maxTick.lastPrice - minTick.lastPrice : 0
  const spreadPct = minTick && minTick.lastPrice > 0 ? (spread / minTick.lastPrice) * 100 : 0

  const selectedName = STOCK_TICKER_NAMES[selectedTicker] ?? selectedTicker

  return (
    <div style={{ padding: 'var(--space-xl)' }}>
      <div style={{ marginBottom: 'var(--space-xl)' }}>
        <h1 style={{ fontSize: 'var(--font-2xl)', margin: 0, marginBottom: 'var(--space-xs)' }}>
          Stock Prices
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
          Live prices for the same stock across multiple data sources. Spread = opportunity.
        </p>
      </div>

      {/* Ticker tabs */}
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-sm)',
          marginBottom: 'var(--space-xl)',
          borderBottom: '1px solid var(--color-border)',
          overflowX: 'auto',
        }}
      >
        {DEFAULT_STOCK_TICKERS.map((ticker) => (
          <button
            key={ticker}
            onClick={() => setSelectedTicker(ticker)}
            style={{
              padding: 'var(--space-md) var(--space-lg)',
              backgroundColor: 'transparent',
              border: 'none',
              borderBottom: selectedTicker === ticker
                ? '2px solid var(--color-accent)'
                : '2px solid transparent',
              color: selectedTicker === ticker
                ? 'var(--color-text-primary)'
                : 'var(--color-text-secondary)',
              fontSize: 'var(--font-md)',
              fontWeight: 600,
              cursor: 'pointer',
              marginBottom: -1,
              whiteSpace: 'nowrap',
            }}
          >
            {ticker}
          </button>
        ))}
      </div>

      {/* Stock info header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 'var(--space-xl)',
          flexWrap: 'wrap',
          gap: 'var(--space-md)',
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 'var(--font-xl)' }}>{selectedTicker}</h2>
          <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>{selectedName}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 'var(--font-sm)', color: 'var(--color-text-secondary)' }}>
            Cross-Source Spread ({pricedSources.length} sources)
          </div>
          <div style={{ fontSize: 'var(--font-2xl)', fontWeight: 700, color: 'var(--color-warning)' }}>
            ${spread.toFixed(2)} ({spreadPct.toFixed(3)}%)
          </div>
        </div>
      </div>

      {error && (
        <div
          style={{
            backgroundColor: 'rgba(248, 81, 73, 0.1)',
            border: '1px solid var(--color-danger)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-md)',
            marginBottom: 'var(--space-lg)',
            color: 'var(--color-danger)',
            fontSize: 'var(--font-sm)',
          }}
        >
          {error}
        </div>
      )}

      {!ready && (
        <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-md)' }}>
          Connecting to data sources...
        </div>
      )}

      {/* Source price cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: 'var(--space-lg)',
          marginBottom: 'var(--space-xl)',
        }}
      >
        {sources.map((source) => {
          const isLowest = source.tick && minTick && source.tick.lastPrice === minTick.lastPrice
          const isHighest = source.tick && maxTick && source.tick.lastPrice === maxTick.lastPrice
          const live = source.updateMode.includes('ws')
          return (
            <div
              key={source.id}
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                border: `1px solid ${
                  source.unavailable
                    ? 'var(--color-border)'
                    : isLowest
                      ? 'var(--color-success)'
                      : isHighest
                        ? 'var(--color-danger)'
                        : 'var(--color-border)'
                }`,
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-lg)',
                position: 'relative',
                opacity: source.unavailable ? 0.6 : 1,
              }}
            >
              {isLowest && !source.unavailable && (
                <div
                  style={{
                    position: 'absolute',
                    top: -10,
                    right: 12,
                    padding: '2px 8px',
                    backgroundColor: 'var(--color-success)',
                    color: 'white',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 'var(--font-xs)',
                    fontWeight: 600,
                  }}
                >
                  LOWEST
                </div>
              )}
              {isHighest && !source.unavailable && (
                <div
                  style={{
                    position: 'absolute',
                    top: -10,
                    right: 12,
                    padding: '2px 8px',
                    backgroundColor: 'var(--color-danger)',
                    color: 'white',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 'var(--font-xs)',
                    fontWeight: 600,
                  }}
                >
                  HIGHEST
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 'var(--space-md)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      backgroundColor: source.unavailable ? 'var(--color-text-muted)' : live ? 'var(--color-success)' : 'var(--color-warning)',
                      display: 'inline-block',
                    }}
                  />
                  <div>
                    <div style={{ fontWeight: 600 }}>{source.name}</div>
                    <div
                      style={{
                        fontSize: 'var(--font-xs)',
                        color: KIND_COLOR[source.kind] ?? 'var(--color-text-secondary)',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                      }}
                    >
                      {KIND_LABEL[source.kind] ?? source.kind}
                    </div>
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 'var(--font-xs)',
                    color: 'var(--color-text-muted)',
                    backgroundColor: 'var(--color-bg-tertiary)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '2px 6px',
                  }}
                >
                  {source.updateMode.includes('ws') ? 'WS' : source.updateMode.includes('polling') ? 'POLL' : 'REST'}
                </span>
              </div>

              {source.tick ? (
                <>
                  <div
                    style={{
                      fontSize: 'var(--font-2xl)',
                      fontWeight: 700,
                      fontFamily: 'monospace',
                    }}
                  >
                    ${source.tick.lastPrice.toFixed(2)}
                  </div>
                  <div
                    style={{
                      fontSize: 'var(--font-sm)',
                      color:
                        (source.tick.change24h ?? 0) >= 0
                          ? 'var(--color-success)'
                          : 'var(--color-danger)',
                      marginTop: 'var(--space-xs)',
                    }}
                  >
                    {(source.tick.change24h ?? 0) >= 0 ? '▲' : '▼'}{' '}
                    {Math.abs((source.tick.change24h ?? 0) * 100).toFixed(2)}% (24h)
                  </div>
                  <div
                    style={{
                      marginTop: 'var(--space-md)',
                      paddingTop: 'var(--space-md)',
                      borderTop: '1px solid var(--color-border-light)',
                      fontSize: 'var(--font-sm)',
                      color: 'var(--color-text-muted)',
                      display: 'flex',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>Bid</span>
                    <span style={{ fontFamily: 'monospace' }}>
                      {source.tick.bidPrice > 0 ? `$${source.tick.bidPrice.toFixed(2)}` : '—'}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 'var(--font-sm)',
                      color: 'var(--color-text-muted)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginTop: 'var(--space-xs)',
                    }}
                  >
                    <span>Ask</span>
                    <span style={{ fontFamily: 'monospace' }}>
                      {source.tick.askPrice > 0 ? `$${source.tick.askPrice.toFixed(2)}` : '—'}
                    </span>
                  </div>
                </>
              ) : (
                <div style={{ padding: 'var(--space-lg) 0', textAlign: 'center' }}>
                  <div style={{ fontSize: 'var(--font-lg)', color: 'var(--color-text-muted)' }}>
                    Unavailable
                  </div>
                  <div
                    style={{
                      fontSize: 'var(--font-xs)',
                      color: 'var(--color-text-muted)',
                      marginTop: 'var(--space-xs)',
                    }}
                  >
                    {selectedTicker} not listed on {source.name}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Action bar - placeholders until execution + AI are wired */}
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-md)',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <button
          disabled
          title="Order execution arrives in a later milestone"
          style={{
            padding: 'var(--space-md) var(--space-xl)',
            backgroundColor: 'rgba(63, 185, 80, 0.15)',
            color: 'var(--color-success)',
            borderRadius: 'var(--radius-md)',
            fontWeight: 600,
            border: '1px solid rgba(63, 185, 80, 0.4)',
            cursor: 'not-allowed',
            opacity: 0.6,
          }}
        >
          Buy {selectedTicker}
        </button>
        <button
          disabled
          title="Order execution arrives in a later milestone"
          style={{
            padding: 'var(--space-md) var(--space-xl)',
            backgroundColor: 'rgba(248, 81, 73, 0.15)',
            color: 'var(--color-danger)',
            borderRadius: 'var(--radius-md)',
            fontWeight: 600,
            border: '1px solid rgba(248, 81, 73, 0.4)',
            cursor: 'not-allowed',
            opacity: 0.6,
          }}
        >
          Sell {selectedTicker}
        </button>
        <button
          title="AI analysis arrives in a later milestone"
          style={{
            padding: 'var(--space-md) var(--space-xl)',
            backgroundColor: 'var(--color-accent)',
            color: 'white',
            borderRadius: 'var(--radius-md)',
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
            opacity: 0.75,
          }}
        >
          🤖 Ask AI to analyze
        </button>
        <span style={{ fontSize: 'var(--font-xs)', color: 'var(--color-text-muted)' }}>
          Prices refresh every 10s · spread computed from {pricedSources.length} live source(s)
        </span>
      </div>
    </div>
  )
}

export default StockTokens
