/**
 * Sidebar navigation component.
 */

import React from 'react'
import type { ViewId } from '../App'

interface NavItem {
  id: ViewId
  label: string
  icon: string
  group?: string
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊', group: 'Trading' },
  { id: 'portfolio', label: 'Portfolio', icon: '💼', group: 'Trading' },
  { id: 'strategies', label: 'Strategies', icon: '📈', group: 'Trading' },
  { id: 'agent', label: 'AI Agent', icon: '🤖', group: 'AI' },
  { id: 'stock-tokens', label: 'Stock Tokens', icon: '🔗', group: 'AI' },
  { id: 'wallets', label: 'Wallets', icon: '👛', group: 'System' },
  { id: 'settings', label: 'Settings', icon: '⚙️', group: 'System' },
]

interface SidebarProps {
  currentView: ViewId
  onNavigate: (view: ViewId) => void
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, onNavigate }) => {
  const groups = [...new Set(NAV_ITEMS.map((item) => item.group))]

  return (
    <aside
      style={{
        width: 'var(--sidebar-width)',
        backgroundColor: 'var(--color-bg-secondary)',
        borderRight: '1px solid var(--color-border)',
        display: 'flex',
        flexDirection: 'column',
        paddingTop: 'var(--space-md)',
        userSelect: 'none',
      }}
    >
      {/* Logo / App name */}
      <div
        style={{
          padding: 'var(--space-md) var(--space-lg)',
          marginBottom: 'var(--space-md)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-sm)',
        }}
      >
        <span style={{ fontSize: 'var(--font-2xl)' }}>⚡</span>
        <span
          style={{
            fontSize: 'var(--font-lg)',
            fontWeight: 700,
            letterSpacing: '0.5px',
          }}
        >
          Vibe
        </span>
      </div>

      {/* Nav groups */}
      <nav style={{ flex: 1, overflowY: 'auto' }}>
        {groups.map((group) => (
          <div key={group} style={{ marginBottom: 'var(--space-md)' }}>
            <div
              style={{
                padding: 'var(--space-sm) var(--space-lg)',
                fontSize: 'var(--font-xs)',
                fontWeight: 600,
                color: 'var(--color-text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              {group}
            </div>
            {NAV_ITEMS.filter((item) => item.group === group).map((item) => {
              const isActive = currentView === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-md)',
                    padding: 'var(--space-sm) var(--space-lg)',
                    backgroundColor: isActive
                      ? 'var(--color-bg-tertiary)'
                      : 'transparent',
                    color: isActive
                      ? 'var(--color-text-primary)'
                      : 'var(--color-text-secondary)',
                    border: 'none',
                    textAlign: 'left',
                    fontSize: 'var(--font-md)',
                    cursor: 'pointer',
                    transition: 'background-color 0.15s, color 0.15s',
                    borderLeft: isActive
                      ? '2px solid var(--color-accent)'
                      : '2px solid transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = 'transparent'
                    }
                  }}
                >
                  <span style={{ fontSize: 'var(--font-lg)' }}>{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Status bar at bottom */}
      <div
        style={{
          padding: 'var(--space-md) var(--space-lg)',
          borderTop: '1px solid var(--color-border)',
          fontSize: 'var(--font-sm)',
          color: 'var(--color-text-muted)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-sm)',
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: 'var(--color-success)',
          }}
        />
        <span>Connected</span>
      </div>
    </aside>
  )
}

export default Sidebar
