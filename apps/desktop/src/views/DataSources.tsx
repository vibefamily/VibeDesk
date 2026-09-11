/**
 * Data Sources view - data source management (module: Data).
 *
 * Lists the registered market data providers with their manifest
 * metadata and live availability status: how many tracked symbols each
 * source currently quotes, and which are unavailable for that source.
 * This is the Data module of the product - the pluggable source layer
 * (Arc chain, Binance stocks with API key, etc.) extends from here.
 */

import React, { useEffect } from 'react'
import { useMarketStore } from '../stores/marketStore'

const KIND_ICON: Record<string, string> = {
  broker: '🏦',
  aggregator: '🔁',
  dex: '🦄',
  cex: '🏛️',
}

const DataSources: React.FC = () => {
  const { ready, error, manifests, ticks, unavailable, init } = useMarketStore()

  useEffect(() => {
    void init()
  }, [init])

  const entries = manifests

  // Count symbols each provider currently quotes.
  const providerQuotes = new Map<string, { live: number; unavailable: number }>()
  for (const [symbol, sourceTicks] of Object.entries(ticks)) {
    for (const providerId of Object.keys(sourceTicks)) {
      const entry = providerQuotes.get(providerId) ?? { live: 0, unavailable: 0 }
      entry.live += 1
      providerQuotes.set(providerId, entry)
    }
  }
  for (const [symbol, providers] of Object.entries(unavailable)) {
    for (const providerId of providers) {
      const entry = providerQuotes.get(providerId) ?? { live: 0, unavailable: 0 }
      entry.unavailable += 1
      providerQuotes.set(providerId, entry)
    }
  }

  return (
    <div style={{ padding: 18, background: '#fff', minHeight: '100%', boxSizing: 'border-box' }}>
      <div
        style={{
          border: '2px outset',
          borderColor: '#fff #808080 #808080 #fff',
          background: '#c0c0c0',
          padding: '10px 14px',
          marginBottom: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <span style={{ fontSize: 26 }}>📡</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Data Sources</div>
          <div style={{ fontSize: 11, color: '#000' }}>
            {entries.length} sources registered · pluggable provider layer (local-first)
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <span
          style={{
            fontSize: 11,
            border: '1px inset',
            borderColor: '#808080 #fff #fff #808080',
            padding: '3px 8px',
            background: '#c0c0c0',
          }}
        >
          {ready ? '● Engine ready' : '○ Starting…'}
        </span>
      </div>

      {error && (
        <div
          style={{
            marginBottom: 12,
            padding: '8px 12px',
            border: '1px inset',
            borderColor: '#808080 #fff #fff #808080',
            background: '#fff',
            fontSize: 12,
            color: '#a00',
          }}
        >
          Engine error: {error}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {entries.map((entry) => {
          const status = providerQuotes.get(entry.id) ?? { live: 0, unavailable: 0 }
          const active = status.live > 0
          return (
            <div
              key={entry.id}
              style={{
                width: 300,
                border: '2px outset',
                borderColor: '#fff #808080 #808080 #fff',
                background: '#c0c0c0',
                padding: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 22 }}>{KIND_ICON[entry.kind] ?? '📊'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{entry.name}</div>
                  <div style={{ fontSize: 10 }}>{entry.kind} · {entry.assetScope}</div>
                </div>
                <span
                  style={{
                    fontSize: 10,
                    padding: '2px 6px',
                    border: '1px solid',
                    borderColor: active ? '#008000' : '#888',
                    background: active ? '#e8f5e8' : '#eee',
                    color: active ? '#008000' : '#666',
                  }}
                >
                  {active ? '● LIVE' : '○ IDLE'}
                </span>
              </div>
              <div style={{ fontSize: 11, marginBottom: 6, lineHeight: 1.4 }}>
                {entry.description}
              </div>
              <div style={{ fontSize: 10, color: '#444', marginBottom: 8 }}>
                Auth: {entry.authRequired ? 'required (user key)' : 'none (public)'}
              </div>
              <div
                style={{
                  border: '1px inset',
                  borderColor: '#808080 #fff #fff #808080',
                  background: '#fff',
                  padding: '4px 8px',
                  fontSize: 11,
                }}
              >
                {status.live} symbols live · {status.unavailable} unavailable
              </div>
            </div>
          )
        })}
      </div>

      {!ready && entries.length === 0 && (
        <p style={{ fontSize: 12, color: '#444' }}>Loading source registry…</p>
      )}

      <div
        style={{
          marginTop: 16,
          padding: '8px 12px',
          border: '1px inset',
          borderColor: '#808080 #fff #fff #808080',
          background: '#fff',
          fontSize: 11,
          color: '#444',
          lineHeight: 1.5,
        }}
      >
        💡 Sources are pluggable: Binance (stocks, with API key), Arc chain and more can be added
        as providers. The engine will move into the main process so browser CORS never applies.
      </div>
    </div>
  )
}

export default DataSources
