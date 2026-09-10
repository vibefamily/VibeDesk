/**
 * Strategies view - browse, configure, and run trading strategies.
 */

import React, { useState } from 'react'

interface StrategyCardProps {
  name: string
  category: string
  description: string
  returns: string
  winRate: string
  onRun: () => void
}

const StrategyCard: React.FC<StrategyCardProps> = ({
  name,
  category,
  description,
  returns,
  winRate,
  onRun,
}) => (
  <div
    style={{
      backgroundColor: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      padding: 'var(--space-lg)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-md)',
    }}
  >
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: 'var(--font-lg)' }}>{name}</h3>
        <span
          style={{
            padding: '2px 8px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'var(--color-bg-tertiary)',
            fontSize: 'var(--font-xs)',
            color: 'var(--color-text-secondary)',
            textTransform: 'capitalize',
          }}
        >
          {category.replace('_', ' ')}
        </span>
      </div>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-sm)', margin: 'var(--space-sm) 0 0 0' }}>
        {description}
      </p>
    </div>

    <div style={{ display: 'flex', gap: 'var(--space-lg)' }}>
      <div>
        <div style={{ fontSize: 'var(--font-xs)', color: 'var(--color-text-muted)' }}>
          Backtest Return
        </div>
        <div style={{ fontSize: 'var(--font-lg)', fontWeight: 700, color: 'var(--color-success)' }}>
          {returns}
        </div>
      </div>
      <div>
        <div style={{ fontSize: 'var(--font-xs)', color: 'var(--color-text-muted)' }}>
          Win Rate
        </div>
        <div style={{ fontSize: 'var(--font-lg)', fontWeight: 700 }}>{winRate}</div>
      </div>
    </div>

    <button
      onClick={onRun}
      style={{
        padding: 'var(--space-sm) var(--space-md)',
        backgroundColor: 'var(--color-accent)',
        color: 'white',
        borderRadius: 'var(--radius-md)',
        fontWeight: 600,
        border: 'none',
        cursor: 'pointer',
        alignSelf: 'flex-start',
      }}
    >
      Run Backtest
    </button>
  </div>
)

const Strategies: React.FC = () => {
  const [runningId, setRunningId] = useState<string | null>(null)

  const strategies = [
    {
      id: 'sma_cross',
      name: 'SMA Crossover',
      category: 'trend',
      description: 'Trend-following strategy using fast/slow moving average crossovers.',
      returns: '+24.5%',
      winRate: '58%',
    },
    {
      id: 'mean_reversion',
      name: 'RSI Mean Reversion',
      category: 'mean_reversion',
      description: 'Contrarian strategy buying oversold and selling overbought conditions.',
      returns: '+18.2%',
      winRate: '52%',
    },
    {
      id: 'arbitrage',
      name: 'Cross-Chain Arbitrage',
      category: 'arbitrage',
      description: 'Exploit price differences of stock tokens across blockchains.',
      returns: '+32.1%',
      winRate: '76%',
    },
    {
      id: 'grid',
      name: 'Grid Trading',
      category: 'other',
      description: 'Automated grid of buy/sell orders within a price range.',
      returns: '+12.8%',
      winRate: '65%',
    },
  ]

  const handleRun = (id: string) => {
    setRunningId(id)
    setTimeout(() => setRunningId(null), 2000)
  }

  return (
    <div style={{ padding: 'var(--space-xl)' }}>
      <div style={{ marginBottom: 'var(--space-xl)' }}>
        <h1 style={{ fontSize: 'var(--font-2xl)', margin: 0, marginBottom: 'var(--space-xs)' }}>
          Strategies
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
          Browse, configure, and backtest trading strategies.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 'var(--space-lg)',
        }}
      >
        {strategies.map((s) => (
          <StrategyCard
            key={s.id}
            name={s.name}
            category={s.category}
            description={s.description}
            returns={runningId === s.id ? 'Running...' : s.returns}
            winRate={s.winRate}
            onRun={() => handleRun(s.id)}
          />
        ))}
      </div>
    </div>
  )
}

export default Strategies
