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

/** Desktop icons: the four core product modules. */
const DESKTOP_ICONS = [
  { key: 'chat-center', label: 'Chat Center', icon: '💬', hint: 'Talk to your AI agent - default home' },
  { key: 'stock-tokens', label: 'Trade Center', icon: '📈', hint: 'Multi-source real-time prices & spread' },
  { key: 'agents', label: 'AI Agents', icon: '🤖', hint: 'Agent analysis & skills' },
  { key: 'wallets', label: 'Wallet Manager', icon: '👛', hint: 'Local encrypted multi-wallet vault' },
  { key: 'data', label: 'Data Sources', icon: '📡', hint: 'Data source management' },
  { key: 'info', label: 'Info Center', icon: '📰', hint: 'News & tweet feeds for agents' },
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
            flexWrap: 'wrap',
            gap: 6,
            alignContent: 'flex-start',
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
          <DesktopIcon
            icon="⚙️"
            label="Settings"
            hint="Application settings & LLM configuration"
            onClick={() => openWindow('settings', 'Settings', '⚙️')}
          />
          {agents
            .filter((a) => a.desktopIcon)
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
