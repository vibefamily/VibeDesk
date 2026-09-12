/**
 * Taskbar - the Windows 95 style bottom bar.
 *
 * Start menu (opens the four core modules + settings), running-window
 * buttons (click to minimize/restore) and a live clock.
 */

import React, { useEffect, useState } from 'react'
import { Button, MenuList, MenuListItem, Separator } from 'react95'
import { useWindowStore } from './windowStore'

interface TaskbarProps {
  startMenuOpen: boolean
  setStartMenuOpen: (open: boolean) => void
}

/** Start menu entries: the four core product modules. */
export const START_MENU: {
  key: string
  label: string
  icon: string
  title: string
}[] = [
  { key: 'data-center', label: 'Data Center', icon: '📊', title: 'Data Center - Markets, News & Sources' },
  { key: 'chat-center', label: 'Chat Center', icon: '💬', title: 'Chat Center - Talk to your AI agent' },
  { key: 'agents', label: 'AI Agents', icon: '🤖', title: 'AI Agents - Analysis & Skills' },
  { key: 'wallets', label: 'Wallet Manager', icon: '👛', title: 'Wallet Manager' },
  { key: 'stock-tokens', label: 'Trade Center', icon: '📈', title: 'Trade Center - Multi-Source Prices' },
  { key: 'info', label: 'Info Center', icon: '📰', title: 'Info Center - News & Tweet Feeds' },
  { key: 'data', label: 'Data Sources', icon: '📡', title: 'Data Sources' },
  { key: 'settings', label: 'Settings', icon: '⚙️', title: 'Settings - App & LLM Configuration' },
]

const Taskbar: React.FC<TaskbarProps> = ({ startMenuOpen, setStartMenuOpen }) => {
  const { windows, openWindow, minimizeWindow, restoreWindow } = useWindowStore()
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const openStart = (key: string, label: string, icon: string, title: string) => {
    openWindow(key, title ?? label, icon)
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
            {START_MENU.map((item) => (
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
            <MenuListItem
              onClick={(e) => {
                e.stopPropagation()
                openStart('settings', 'Settings', '⚙️', 'Settings')
              }}
            >
              <span style={{ marginRight: 8 }}>⚙️</span>
              Settings
            </MenuListItem>
            <Separator />
            <MenuListItem
              onClick={(e) => {
                e.stopPropagation()
                setStartMenuOpen(false)
              }}
            >
              <span style={{ marginRight: 8 }}>🚪</span>
              Shut Down…
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
