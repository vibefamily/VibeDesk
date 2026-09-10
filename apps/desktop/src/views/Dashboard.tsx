/**
 * Dashboard view - trading overview with key metrics and watchlist.
 */

import React from 'react'

interface StatCardProps {
  label: string
  value: string
  change?: string
  changePositive?: boolean
}

const StatCard: React.FC<StatCardProps> = ({ label, value, change, changePositive }) => (
  <div
    style={{
      backgroundColor: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      padding: 'var(--space-lg)',
      flex: 1,
    }}
  >
    <div
      style={{
        fontSize: 'var(--font-sm)',
        color: 'var(--color-text-secondary)',
        marginBottom: 'var(--space-sm)',
      }}
    >
      {label}
    </div>
    <div
      style={{
        fontSize: 'var(--font-2xl)',
        fontWeight: 700,
        marginBottom: 'var(--space-xs)',
      }}
    >
      {value}
    </div>
    {change && (
      <div
        style={{
          fontSize: 'var(--font-sm)',
          color: changePositive ? 'var(--color-success)' : 'var(--color-danger)',
        }}
      >
        {changePositive ? '▲' : '▼'} {change}
      </div>
    )}
  </div>
)

const Dashboard: React.FC = () => {
  const watchlist = [
    { symbol: 'BTC/USDT', price: '67,432.50', change: '+2.34%', positive: true },
    { symbol: 'ETH/USDT', price: '3,521.80', change: '+1.87%', positive: true },
    { symbol: 'SOL/USDT', price: '142.65', change: '-0.52%', positive: false },
    { symbol: 'TSLA', price: '$245.32', change: '+0.85%', positive: true },
    { symbol: 'AAPL', price: '$189.45', change: '-0.23%', positive: false },
  ]

  return (
    <div style={{ padding: 'var(--space-xl)' }}>
      {/* Header */}
      <div style={{ marginBottom: 'var(--space-xl)' }}>
        <h1 style={{ fontSize: 'var(--font-2xl)', margin: 0, marginBottom: 'var(--space-xs)' }}>
          Dashboard
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
          Welcome back — here's your trading overview.
        </p>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: 'var(--space-lg)', marginBottom: 'var(--space-xl)' }}>
        <StatCard
          label="Total Equity"
          value="$24,857.32"
          change="+12.4% all time"
          changePositive
        />
        <StatCard
          label="Today's P&L"
          value="+$342.15"
          change="+1.40%"
          changePositive
        />
        <StatCard
          label="Open Positions"
          value="3"
        />
        <StatCard
          label="Active Strategies"
          value="2"
        />
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-xl)' }}>
        {/* Watchlist */}
        <div
          style={{
            flex: 1,
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
            Watchlist
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-sm)' }}>
                <th style={{ textAlign: 'left', padding: 'var(--space-sm) var(--space-lg)', fontWeight: 500 }}>
                  Symbol
                </th>
                <th style={{ textAlign: 'right', padding: 'var(--space-sm) var(--space-lg)', fontWeight: 500 }}>
                  Price
                </th>
                <th style={{ textAlign: 'right', padding: 'var(--space-sm) var(--space-lg)', fontWeight: 500 }}>
                  24h Change
                </th>
              </tr>
            </thead>
            <tbody>
              {watchlist.map((item) => (
                <tr
                  key={item.symbol}
                  style={{
                    borderTop: '1px solid var(--color-border-light)',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                >
                  <td style={{ padding: 'var(--space-md) var(--space-lg)', fontWeight: 500 }}>
                    {item.symbol}
                  </td>
                  <td
                    style={{
                      padding: 'var(--space-md) var(--space-lg)',
                      textAlign: 'right',
                      fontFamily: 'monospace',
                    }}
                  >
                    {item.price}
                  </td>
                  <td
                    style={{
                      padding: 'var(--space-md) var(--space-lg)',
                      textAlign: 'right',
                      color: item.positive ? 'var(--color-success)' : 'var(--color-danger)',
                      fontFamily: 'monospace',
                    }}
                  >
                    {item.change}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Recent activity */}
        <div
          style={{
            flex: 1,
            backgroundColor: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
          }}
        >
          <div
            style={{
              padding: 'var(--space-md) var(--space-lg)',
              borderBottom: '1px solid var(--color-border)',
              fontWeight: 600,
            }}
          >
            Recent Activity
          </div>
          <div style={{ padding: 'var(--space-lg)' }}>
            {[
              { type: 'trade', text: 'Bought 0.5 BTC @ $67,200', time: '2 min ago' },
              { type: 'strategy', text: 'SMA Cross strategy entered long', time: '15 min ago' },
              { type: 'agent', text: 'AI Agent detected arbitrage opportunity on TSLA', time: '1 hour ago' },
              { type: 'trade', text: 'Sold 100 SOL @ $143.50', time: '3 hours ago' },
            ].map((activity, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: 'var(--space-sm) 0',
                  borderBottom:
                    i < 3 ? '1px solid var(--color-border-light)' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                  <span>
                    {activity.type === 'trade' && '📈'}
                    {activity.type === 'strategy' && '⚙️'}
                    {activity.type === 'agent' && '🤖'}
                  </span>
                  <span style={{ fontSize: 'var(--font-md)' }}>{activity.text}</span>
                </div>
                <span style={{ fontSize: 'var(--font-sm)', color: 'var(--color-text-muted)' }}>
                  {activity.time}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
