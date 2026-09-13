/**
 * Taskbar - the Windows 95 style bottom bar.
 *
 * Start menu (opens the four core modules + settings), running-window
 * buttons (click to minimize/restore) and a live clock.
 */

import React, { useEffect, useState } from 'react'
import { Button, MenuList, MenuListItem, Separator } from 'react95'
import { useWindowStore } from './windowStore'
import { useAgentStore } from '../../stores/agentStore'

interface TaskbarProps {
  startMenuOpen: boolean
  setStartMenuOpen: (open: boolean) => void
}

/** Start menu entries grouped by pillar: Data / Agent / Wallet. */
export const START_MENU: {
  group: string
  items: { key: string; label: string; icon: string; title: string }[]
}[] = [
  {
    group: 'Data',
    items: [
      { key: 'data-center', label: 'Data Center', icon: '📊', title: 'Data Center - Markets, News & Sources' },
    ],
  },
  {
    group: 'Agent',
    items: [
      { key: 'agent-chat', label: 'Chat Agent', icon: '💬', title: 'Chat Agent - Talk with your default agent' },
      { key: 'trade-run', label: 'Trade Agent', icon: '🔄', title: 'Trade Agent - Signal to On-chain Execution' },
      { key: 'skills', label: 'Skills', icon: '🧩', title: 'Skills - Manage agent skills & install new ones' },
      { key: 'agents', label: 'Agent Manager', icon: '🤖', title: 'Agent Manager - Create, chat & manage agents' },
    ],
  },
  {
    group: 'Wallet',
    items: [
      { key: 'wallets', label: 'Wallet Manager', icon: '👛', title: 'Wallet Manager' },
    ],
  },
]

const Taskbar: React.FC<TaskbarProps> = ({ startMenuOpen, setStartMenuOpen }) => {
  const { windows, openWindow, minimizeWindow, restoreWindow, openChatWindow } = useWindowStore()
  const agents = useAgentStore((s) => s.agents)
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const openStart = (key: string, label: string, icon: string, title: string) => {
    if (key === 'agent-chat') {
      // Open the default agent's chat window (or Chat Center while the
      // agent list is still loading).
      const def = agents[0] ?? null
      if (def) openChatWindow(def.id, def.name, def.icon)
      else openWindow('chat-center', 'Chat Center', '💬')
    } else {
      openWindow(key, title ?? label, icon)
    }
    setStartMenuOpen(false)
  }

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        height: 40,
        background: '#c0c0c0',
        border: '2px solid',
        borderColor: '#fff #000 #000 #fff',
        display: 'flex',
        alignItems: 'center',
        padding: '0 6px',
        gap: 6,
        fontFamily: 'MS Sans Serif, Arial, sans-serif',
      }}
    >
      <div style={{ position: 'relative' }}>
        <Button
          onClick={(e) => {
            e.stopPropagation()
            setStartMenuOpen(!startMenuOpen)
          }}
          active={startMenuOpen}
          style={{ fontWeight: 700, fontSize: 12 }}
        >
          <span style={{ marginRight: 4 }}>💾</span> Start
        </Button>
        {startMenuOpen && (
          <MenuList
            style={{
              position: 'absolute',
              left: 0,
              bottom: '100%',
              marginBottom: 2,
              width: 210,
            }}
          >
            {START_MENU.map((group) => (
              <div key={group.group}>
                {group.items.map((item) => (
                  <MenuListItem
                    key={item.key}
                    onClick={(e) => {
                      e.stopPropagation()
                      openStart(item.key, item.label, item.icon, item.title)
                    }}
                  >
                    <span style={{ marginRight: 8 }}>{item.icon}</span>
                    {item.label}
                  </MenuListItem>
                ))}
                <Separator />
              </div>
            ))}
            <MenuListItem
              onClick={(e) => {
                e.stopPropagation()
                openStart('settings', 'Settings', '⚙️', 'Settings - App & LLM Configuration')
              }}
            >
              <span style={{ marginRight: 8 }}>⚙️</span>
              Settings
            </MenuListItem>
          </MenuList>
        )}
      </div>

      <div style={{ display: 'flex', gap: 4, flex: 1, overflow: 'hidden', minWidth: 0 }}>
        {windows.map((win) => (
          <Button
            key={win.id}
            variant={win.isMinimized ? 'default' : 'thin'}
            active={!win.isMinimized}
            onClick={() =>
              win.isMinimized ? restoreWindow(win.id) : minimizeWindow(win.id)
            }
            style={{
              maxWidth: 170,
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              textOverflow: 'ellipsis',
              fontSize: 11,
              padding: '3px 8px',
            }}
          >
            {win.icon} {win.title}
          </Button>
        ))}
      </div>

      <div
        style={{
          flexShrink: 0,
          border: '1px inset',
          borderColor: '#808080 #fff #fff #808080',
          padding: '3px 10px',
          fontSize: 11,
          background: '#c0c0c0',
        }}
      >
        {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>
  )
}

export default Taskbar
