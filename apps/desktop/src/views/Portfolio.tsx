/**
 * Portfolio view - positions, balances, and P&L overview.
 */

import React from 'react'

const Portfolio: React.FC = () => {
  const positions = [
    {
      symbol: 'BTC/USDT',
      size: '0.5',
      entryPrice: '$62,500.00',
      currentPrice: '$67,432.50',
      pnl: '+$2,466.25',
      pnlPercent: '+7.89%',
      positive: true,
    },
    {
      symbol: 'ETH/USDT',
      size: '5.0',
      entryPrice: '$3,200.00',
      currentPrice: '$3,521.80',
      pnl: '+$1,609.00',
      pnlPercent: '+10.06%',
      positive: true,
    },
    {
      symbol: 'SOL/USDT',
      size: '100',
      entryPrice: '$150.00',
      currentPrice: '$142.65',
      pnl: '-$735.00',
      pnlPercent: '-4.90%',
      positive: false,
    },
  ]

  const balances = [
    { asset: 'USDT', available: '12,345.67', total: '15,678.90', value: '$15,678.90' },
    { asset: 'BTC', available: '0.5', total: '0.5', value: '$33,716.25' },
    { asset: 'ETH', available: '5.0', total: '5.0', value: '$17,609.00' },
  ]

  return (
    <div style={{ padding: 'var(--space-xl)' }}>
      <div style={{ marginBottom: 'var(--space-xl)' }}>
        <h1 style={{ fontSize: 'var(--font-2xl)', margin: 0, marginBottom: 'var(--space-xs)' }}>
          Portfolio
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
          Track your positions and balances across all exchanges.
        </p>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: 'var(--space-lg)', marginBottom: 'var(--space-xl)' }}>
        <div
          style={{
            flex: 1,
            backgroundColor: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-lg)',
          }}
        >
          <div style={{ fontSize: 'var(--font-sm)', color: 'var(--color-text-secondary)' }}>
            Total Equity
          </div>
          <div style={{ fontSize: 'var(--font-2xl)', fontWeight: 700, marginTop: 'var(--space-sm)' }}>
            $67,004.15
          </div>
        </div>
        <div
          style={{
            flex: 1,
            backgroundColor: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-lg)',
          }}
        >
          <div style={{ fontSize: 'var(--font-sm)', color: 'var(--color-text-secondary)' }}>
            Unrealized P&L
          </div>
          <div
            style={{
              fontSize: 'var(--font-2xl)',
              fontWeight: 700,
              marginTop: 'var(--space-sm)',
              color: 'var(--color-success)',
            }}
          >
            +$3,340.25
          </div>
          <div style={{ fontSize: 'var(--font-sm)', color: 'var(--color-success)' }}>+5.25%</div>
        </div>
      </div>

      {/* Positions table */}
      <div
        style={{
          backgroundColor: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          marginBottom: 'var(--space-xl)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: 'var(--space-md) var(--space-lg)',
            borderBottom: '1px solid var(--color-border)',
            fontWeight: 600,
          }}
        >
          Open Positions
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-sm)' }}>
              <th style={{ textAlign: 'left', padding: 'var(--space-sm) var(--space-lg)', fontWeight: 500 }}>
                Symbol
              </th>
              <th style={{ textAlign: 'right', padding: 'var(--space-sm) var(--space-lg)', fontWeight: 500 }}>
                Size
              </th>
              <th style={{ textAlign: 'right', padding: 'var(--space-sm) var(--space-lg)', fontWeight: 500 }}>
                Entry Price
              </th>
              <th style={{ textAlign: 'right', padding: 'var(--space-sm) var(--space-lg)', fontWeight: 500 }}>
                Current Price
              </th>
              <th style={{ textAlign: 'right', padding: 'var(--space-sm) var(--space-lg)', fontWeight: 500 }}>
                P&L
              </th>
              <th style={{ textAlign: 'right', padding: 'var(--space-sm) var(--space-lg)', fontWeight: 500 }}>
                P&L %
              </th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => (
              <tr key={p.symbol} style={{ borderTop: '1px solid var(--color-border-light)' }}>
                <td style={{ padding: 'var(--space-md) var(--space-lg)', fontWeight: 500 }}>
                  {p.symbol}
                </td>
                <td style={{ padding: 'var(--space-md) var(--space-lg)', textAlign: 'right', fontFamily: 'monospace' }}>
                  {p.size}
                </td>
                <td style={{ padding: 'var(--space-md) var(--space-lg)', textAlign: 'right', fontFamily: 'monospace' }}>
                  {p.entryPrice}
                </td>
                <td style={{ padding: 'var(--space-md) var(--space-lg)', textAlign: 'right', fontFamily: 'monospace' }}>
                  {p.currentPrice}
                </td>
                <td
                  style={{
                    padding: 'var(--space-md) var(--space-lg)',
                    textAlign: 'right',
                    fontFamily: 'monospace',
                    color: p.positive ? 'var(--color-success)' : 'var(--color-danger)',
                  }}
                >
                  {p.pnl}
                </td>
                <td
                  style={{
                    padding: 'var(--space-md) var(--space-lg)',
                    textAlign: 'right',
                    fontFamily: 'monospace',
                    color: p.positive ? 'var(--color-success)' : 'var(--color-danger)',
                  }}
                >
                  {p.pnlPercent}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Balances */}
      <div
        style={{
          backgroundColor: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: 'var(--space-md) var(--space-lg)',
            borderBottom: '1px solid var(--color-border)',
            fontWeight: 600,
          }}
        >
          Balances
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-sm)' }}>
              <th style={{ textAlign: 'left', padding: 'var(--space-sm) var(--space-lg)', fontWeight: 500 }}>
                Asset
              </th>
              <th style={{ textAlign: 'right', padding: 'var(--space-sm) var(--space-lg)', fontWeight: 500 }}>
                Available
              </th>
              <th style={{ textAlign: 'right', padding: 'var(--space-sm) var(--space-lg)', fontWeight: 500 }}>
                Total
              </th>
              <th style={{ textAlign: 'right', padding: 'var(--space-sm) var(--space-lg)', fontWeight: 500 }}>
                Value
              </th>
            </tr>
          </thead>
          <tbody>
            {balances.map((b) => (
              <tr key={b.asset} style={{ borderTop: '1px solid var(--color-border-light)' }}>
                <td style={{ padding: 'var(--space-md) var(--space-lg)', fontWeight: 500 }}>
                  {b.asset}
                </td>
                <td style={{ padding: 'var(--space-md) var(--space-lg)', textAlign: 'right', fontFamily: 'monospace' }}>
                  {b.available}
                </td>
                <td style={{ padding: 'var(--space-md) var(--space-lg)', textAlign: 'right', fontFamily: 'monospace' }}>
                  {b.total}
                </td>
                <td style={{ padding: 'var(--space-md) var(--space-lg)', textAlign: 'right', fontFamily: 'monospace' }}>
                  {b.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default Portfolio
