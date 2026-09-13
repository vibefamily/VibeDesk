/**
 * Desktop - the Windows 95 style desktop shell for VibeDesk.
 *
 * Teal background with the four core module icons (Data / AI / Wallet /
 * Trade) plus Settings; open windows render above, taskbar pinned below.
 */

import React, { useEffect, useState } from 'react'
import DesktopIcon from './DesktopIcon'
import WindowManager from './WindowManager'
import Taskbar, { START_MENU } from './Taskbar'
import { useWindowStore } from './windowStore'
import { useUiStore } from '../../stores/uiStore'
import { useAgentStore } from '../../stores/agentStore'

/**
 * Desktop icons: Wallet Manager + Data Center (product modules), then the
 * seeded agents as their own shortcuts — Trade Agent and Chat Agent.
 * Order: Wallet Manager, Data Center, Trade Agent, Chat Agent.
 * Settings is not on the desktop; it lives in the Start menu.
 */
const DESKTOP_ICONS = [
  { key: 'wallets', label: 'Wallet Manager', icon: '👛', hint: 'Local encrypted multi-wallet vault' },
  { key: 'data-center', label: 'Data Center', icon: '📊', hint: 'Markets, news & data sources in one window' },
]

const Desktop: React.FC = () => {
  const [startMenuOpen, setStartMenuOpen] = useState(false)
  const openWindow = useWindowStore((s) => s.openWindow)
  const openChatWindow = useWindowStore((s) => s.openChatWindow)
  const zoom = useUiStore((s) => s.zoom)
  const agents = useAgentStore((s) => s.agents)
  const refreshAgents = useAgentStore((s) => s.refresh)

  // Load persisted agents so desktop shortcuts (desktopIcon) appear on boot.
  useEffect(() => {
    void refreshAgents()
  }, [refreshAgents])

  return (
    <div
      onClick={() => setStartMenuOpen(false)}
      style={{
        height: '100vh',
        width: '100vw',
        background: '#008080',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: 'MS Sans Serif, Arial, sans-serif',
        zoom,
      }}
    >

      <div
        style={{
          position: 'absolute',
          top: 36,
          left: 0,
          right: 0,
          bottom: 40,
          overflow: 'hidden',
        }}
      >
        {/* Desktop icons */}
        <div
          style={{
            padding: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            alignItems: 'flex-start',
          }}
        >
          {DESKTOP_ICONS.map((item) => (
            <DesktopIcon
              key={item.key}
              icon={item.icon}
              label={item.label}
              hint={item.hint}
              onClick={() => openWindow(item.key, item.label, item.icon)}
            />
          ))}
          {agents
            .filter((a) => a.desktopIcon)
            // Seeded order: Trade Agent (stock-analyst) before Chat Agent
            // (general-chat); any extra desktop agents follow.
            .sort((a, b) => {
              const rank = (t: string) => (t === 'stock-analyst' ? 0 : t === 'general-chat' ? 1 : 2)
              return rank(a.templateId) - rank(b.templateId)
            })
            .map((agent) => (
              <DesktopIcon
                key={`agent:${agent.id}`}
                icon={agent.icon}
                label={agent.name}
                hint={`Agent: ${agent.name} (${agent.status}) - double-click to chat`}
                onClick={() => openChatWindow(agent.id, agent.name, agent.icon)}
              />
            ))}
        </div>

        {/* Open windows */}
        <WindowManager />
      </div>

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9999 }}>
        <Taskbar startMenuOpen={startMenuOpen} setStartMenuOpen={setStartMenuOpen} />
      </div>
    </div>
  )
}

export default Desktop
