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
import Strategies from './views/Strategies'
import Portfolio from './views/Portfolio'
import StockTokens from './views/StockTokens'
import Settings from './views/Settings'

export type ViewId =
  | 'dashboard'
  | 'agent'
  | 'portfolio'
  | 'strategies'
  | 'stock-tokens'
  | 'settings'

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewId>('dashboard')

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard />
      case 'agent':
        return <AgentChat />
      case 'portfolio':
        return <Portfolio />
      case 'strategies':
        return <Strategies />
      case 'stock-tokens':
        return <StockTokens />
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
