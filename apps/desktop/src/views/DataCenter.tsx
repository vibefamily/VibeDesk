/**
 * DataCenter - unified entry point for every data source.
 *
 * One window, three tabs: Markets (live multi-source prices), News
 * (news & tweet feeds) and Sources (data source management). Tabs are
 * mounted lazily so polling/IPC only runs for the tab in view, matching
 * the demo story "Data + AI + Wallet = Auto Trading".
 */

import React, { useState } from 'react'
import StockTokens from './StockTokens'
import InfoCenter from './InfoCenter'
import DataSources from './DataSources'
import TradeRun from './TradeRun'

interface TabDef {
  key: string
  label: string
  component: React.FC
}

const TABS: TabDef[] = [
  { key: 'markets', label: 'Markets', component: StockTokens },
  { key: 'trade-run', label: 'Trade Run', component: TradeRun },
  { key: 'news', label: 'News', component: InfoCenter },
  { key: 'sources', label: 'Sources', component: DataSources },
]

const tabBtn = (active: boolean): React.CSSProperties => ({
  padding: '4px 14px',
  marginRight: 2,
  fontSize: 11,
  fontFamily: 'inherit',
  border: '2px outset',
  borderColor: active ? '#808080 #fff #fff #808080' : '#fff #808080 #808080 #fff',
  background: active ? '#c0c0c0' : '#c0c0c0',
  boxShadow: active ? 'inset 1px 1px 0 #808080' : 'none',
  cursor: 'pointer',
  color: '#000',
  position: 'relative',
  top: active ? 1 : 0,
  zIndex: active ? 2 : 1,
})

const DataCenter: React.FC = () => {
  const [active, setActive] = useState('markets')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#c0c0c0' }}>
      {/* Tab strip */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          padding: '6px 6px 0',
          borderBottom: '2px solid #808080',
          background: '#c0c0c0',
          flexShrink: 0,
        }}
      >
        {TABS.map((t) => (
          <button key={t.key} style={tabBtn(active === t.key)} onClick={() => setActive(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Active tab body - lazy mount so only the visible source polls */}
      <div style={{ flex: 1, overflow: 'auto', background: '#fff', border: '2px inset', borderTop: 'none' }}>
        {TABS.filter((t) => t.key === active).map((t) => {
          const Content = t.component
          return <Content key={t.key} />
        })}
      </div>
    </div>
  )
}

export default DataCenter
