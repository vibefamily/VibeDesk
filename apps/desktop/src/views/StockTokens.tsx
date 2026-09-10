/**
 * Stock Tokens view - cross-chain stock token price comparison and arbitrage.
 *
 * This is the key use case for the hackathon: showing the same stock token
 * on different chains, with price differences and arbitrage opportunities.
 */

import React, { useState } from 'react'

interface StockTokenInfo {
  ticker: string
  name: string
  chains: {
    chain: string
    dex: string
    price: number
    change24h: number
    volume24h: number
    tvl: number
  }[]
}

const StockTokens: React.FC = () => {
  const [selectedTicker, setSelectedTicker] = useState<string>('TSLA')

  const stocks: StockTokenInfo[] = [
    {
      ticker: 'TSLA',
      name: 'Tesla Inc.',
      chains: [
        { chain: 'Solana', dex: 'Jupiter', price: 245.32, change24h: 2.34, volume24h: 1250000, tvl: 45000000 },
        { chain: 'Base', dex: 'Uniswap V3', price: 247.18, change24h: 1.87, volume24h: 890000, tvl: 32000000 },
        { chain: 'Arbitrum', dex: 'GMX', price: 244.85, change24h: 2.56, volume24h: 560000, tvl: 28000000 },
      ],
    },
    {
      ticker: 'AAPL',
      name: 'Apple Inc.',
      chains: [
        { chain: 'Solana', dex: 'Jupiter', price: 189.45, change24h: -0.23, volume24h: 980000, tvl: 38000000 },
        { chain: 'Base', dex: 'Uniswap V3', price: 190.12, change24h: -0.15, volume24h: 720000, tvl: 25000000 },
      ],
    },
    {
      ticker: 'NVDA',
      name: 'NVIDIA Corp.',
      chains: [
        { chain: 'Solana', dex: 'Jupiter', price: 118.65, change24h: 3.42, volume24h: 2100000, tvl: 52000000 },
        { chain: 'Base', dex: 'Uniswap V3', price: 120.34, change24h: 2.98, volume24h: 1450000, tvl: 36000000 },
        { chain: 'Arbitrum', dex: 'GMX', price: 117.92, change24h: 3.76, volume24h: 780000, tvl: 22000000 },
        { chain: 'Sui', dex: 'DeepBook', price: 119.48, change24h: 3.21, volume24h: 340000, tvl: 12000000 },
      ],
    },
  ]

  const selectedStock = stocks.find((s) => s.ticker === selectedTicker)!

  // Calculate spread
  const prices = selectedStock.chains.map((c) => c.price)
  const minPrice = Math.min(...prices)
  const maxPrice = Math.max(...prices)
  const spread = maxPrice - minPrice
  const spreadPercent = (spread / minPrice) * 100

  return (
    <div style={{ padding: 'var(--space-xl)' }}>
      <div style={{ marginBottom: 'var(--space-xl)' }}>
        <h1 style={{ fontSize: 'var(--font-2xl)', margin: 0, marginBottom: 'var(--space-xs)' }}>
          Stock Tokens
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
          Cross-chain stock token prices and arbitrage opportunities.
        </p>
      </div>

      {/* Ticker tabs */}
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-sm)',
          marginBottom: 'var(--space-xl)',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        {stocks.map((stock) => (
          <button
            key={stock.ticker}
            onClick={() => setSelectedTicker(stock.ticker)}
            style={{
              padding: 'var(--space-md) var(--space-lg)',
              backgroundColor: 'transparent',
              border: 'none',
              borderBottom: selectedTicker === stock.ticker
                ? '2px solid var(--color-accent)'
                : '2px solid transparent',
              color: selectedTicker === stock.ticker
                ? 'var(--color-text-primary)'
                : 'var(--color-text-secondary)',
              fontSize: 'var(--font-md)',
              fontWeight: 600,
              cursor: 'pointer',
              marginBottom: -1,
            }}
          >
            {stock.ticker}
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
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 'var(--font-xl)' }}>{selectedStock.ticker}</h2>
          <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>{selectedStock.name}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 'var(--font-sm)', color: 'var(--color-text-secondary)' }}>
            Cross-Chain Spread
          </div>
          <div style={{ fontSize: 'var(--font-2xl)', fontWeight: 700, color: 'var(--color-warning)' }}>
            ${spread.toFixed(2)} ({spreadPercent.toFixed(2)}%)
          </div>
        </div>
      </div>

      {/* Chain price cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.min(selectedStock.chains.length, 4)}, 1fr)`,
          gap: 'var(--space-lg)',
          marginBottom: 'var(--space-xl)',
        }}
      >
        {selectedStock.chains.map((chain, idx) => {
          const isLowest = chain.price === minPrice
          const isHighest = chain.price === maxPrice
          return (
            <div
              key={chain.chain}
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                border: `1px solid ${
                  isLowest
                    ? 'var(--color-success)'
                    : isHighest
                      ? 'var(--color-danger)'
                      : 'var(--color-border)'
                }`,
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-lg)',
                position: 'relative',
              }}
            >
              {isLowest && (
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
              {isHighest && (
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

              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}>
                <span style={{ fontSize: 'var(--font-lg)' }}>
                  {chain.chain === 'Solana' && '🟣'}
                  {chain.chain === 'Base' && '🔵'}
                  {chain.chain === 'Arbitrum' && '🔷'}
                  {chain.chain === 'Sui' && '🟢'}
                </span>
                <div>
                  <div style={{ fontWeight: 600 }}>{chain.chain}</div>
                  <div style={{ fontSize: 'var(--font-sm)', color: 'var(--color-text-muted)' }}>
                    {chain.dex}
                  </div>
                </div>
              </div>

              <div style={{ fontSize: 'var(--font-2xl)', fontWeight: 700, fontFamily: 'monospace' }}>
                ${chain.price.toFixed(2)}
              </div>
              <div
                style={{
                  fontSize: 'var(--font-sm)',
                  color: chain.change24h >= 0 ? 'var(--color-success)' : 'var(--color-danger)',
                  marginTop: 'var(--space-xs)',
                }}
              >
                {chain.change24h >= 0 ? '▲' : '▼'} {Math.abs(chain.change24h).toFixed(2)}%
              </div>

              <div style={{ marginTop: 'var(--space-md)', paddingTop: 'var(--space-md)', borderTop: '1px solid var(--color-border-light)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-sm)' }}>
                  <span className="text-muted">24h Vol</span>
                  <span style={{ fontFamily: 'monospace' }}>${(chain.volume24h / 1000).toFixed(0)}K</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-sm)', marginTop: 'var(--space-xs)' }}>
                  <span className="text-muted">TVL</span>
                  <span style={{ fontFamily: 'monospace' }}>${(chain.tvl / 1000000).toFixed(1)}M</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Arbitrage opportunity card */}
      <div
        style={{
          backgroundColor: 'rgba(210, 153, 34, 0.1)',
          border: '1px solid var(--color-warning)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-lg)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}>
          <span style={{ fontSize: 'var(--font-xl)' }}>⚡</span>
          <h3 style={{ margin: 0, fontSize: 'var(--font-lg)' }}>Arbitrage Opportunity Detected</h3>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-xl)', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 'var(--font-sm)', color: 'var(--color-text-secondary)' }}>
              Buy on Solana (lowest) → Sell on Base (highest)
            </div>
            <div style={{ fontSize: 'var(--font-md)', fontWeight: 600, marginTop: 'var(--space-xs)' }}>
              {selectedStock.chains.find((c) => c.price === minPrice)?.chain} →{' '}
              {selectedStock.chains.find((c) => c.price === maxPrice)?.chain}
            </div>
          </div>

          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 'var(--font-sm)', color: 'var(--color-text-secondary)' }}>
              Profit (after fees)
            </div>
            <div style={{ fontSize: 'var(--font-xl)', fontWeight: 700, color: 'var(--color-success)' }}>
              ~${(spread - 1.5).toFixed(2)}
            </div>
            <div style={{ fontSize: 'var(--font-sm)', color: 'var(--color-success)' }}>
              {((spreadPercent - 0.6)).toFixed(2)}% per trade
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
            <button
              style={{
                padding: 'var(--space-sm) var(--space-lg)',
                backgroundColor: 'var(--color-accent)',
                color: 'white',
                borderRadius: 'var(--radius-md)',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Ask AI Agent
            </button>
            <button
              style={{
                padding: 'var(--space-sm) var(--space-lg)',
                backgroundColor: 'transparent',
                color: 'var(--color-text-secondary)',
                borderRadius: 'var(--radius-md)',
                fontWeight: 500,
                border: '1px solid var(--color-border)',
                cursor: 'pointer',
              }}
            >
              View Details
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default StockTokens
