/**
 * Vibe Desktop - main App component.
 *
 * Layout: left sidebar navigation + main content area.
 * Uses simple state-based navigation (no router needed for MVP).
 */

import React, { useState } from 'react'
import Sidebar from './components/Sidebar'
import Dashboard from './views/Dashboard'
import AgentChat from './views/AgentChat'
import Agents from './views/Agents'
import Strategies from './views/Strategies'
import Portfolio from './views/Portfolio'
import StockTokens from './views/StockTokens'
import Wallets from './views/Wallets'
import Settings from './views/Settings'

export type ViewId =
  | 'dashboard'
  | 'agent'
  | 'portfolio'
  | 'strategies'
  | 'stock-tokens'
  | 'wallets'
  | 'settings'

const App: React.FC = () => {
  // Open on the core showcase screen (multi-source price comparison).
  const [currentView, setCurrentView] = useState<ViewId>('stock-tokens')

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard />
      case 'agent':
        return <Agents />
      case 'portfolio':
        return <Portfolio />
      case 'strategies':
        return <Strategies />
      case 'stock-tokens':
        return <StockTokens />
      case 'wallets':
        return <Wallets />
      case 'settings':
        return <Settings />
      default:
        return <Dashboard />
    }
  }

  return (
    <div style={{ display: 'flex', height: '100%', width: '100%' }}>
      <Sidebar currentView={currentView} onNavigate={setCurrentView} />
      <main
        style={{
          flex: 1,
          overflow: 'auto',
          backgroundColor: 'var(--color-bg-primary)',
        }}
      >
        {renderView()}
      </main>
    </div>
  )
}

export default App
