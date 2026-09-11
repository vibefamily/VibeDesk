/**
 * Chat Center - session manager for chat windows.
 *
 * Lists every chat session and lets the user start new ones from
 * templates. Clicking a session opens it as its own desktop window
 * (which can be minimized to the taskbar independently). This is the
 * lightweight "manager" view; each conversation lives in ChatWindow.
 */

import React, { useEffect, useState } from 'react'
import { useAgentStore } from '../stores/agentStore'
import { useWindowStore } from '../components/95/windowStore'

const OUTSET: React.CSSProperties = {
  border: '2px outset',
  borderColor: '#fff #808080 #808080 #fff',
  background: '#c0c0c0',
}

const INSET: React.CSSProperties = {
  border: '2px inset',
  borderColor: '#808080 #fff #fff #808080',
  background: '#fff',
}

const BTN: React.CSSProperties = {
  padding: '3px 10px',
  fontSize: 11,
  background: '#c0c0c0',
  border: '2px outset',
  borderColor: '#fff #808080 #808080 #fff',
  cursor: 'pointer',
  fontFamily: 'inherit',
  color: '#000',
}

const ChatCenter: React.FC = () => {
  const { templates, agents, mode, loading, refresh, create } = useAgentStore()
  const openChatWindow = useWindowStore((s) => s.openChatWindow)
  const openWindow = useWindowStore((s) => s.openWindow)

  const [newing, setNewing] = useState(false)

  // Keep the list in sync and bootstrap a General Chat session so the
  // user always has a default conversation to open.
  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (loading) return
    if (agents.length === 0 && !newing) {
      void (async () => {
        setNewing(true)
        try {
          await create({ templateId: 'general-chat', name: 'General Chat' })
          await refresh()
        } finally {
          setNewing(false)
        }
      })()
    }
  }, [loading, agents.length, newing, create, refresh])

  const openSession = (agentId: string, name: string, icon: string): void => {
    openChatWindow(agentId, name, icon)
  }

  const startFromTemplate = async (tplId: string): Promise<void> => {
    if (newing) return
    setNewing(true)
    const tpl = templates.find((t) => t.id === tplId)
    try {
      await create({ templateId: tplId, name: tpl?.name ?? 'Chat' })
      await refresh()
      const created = agents.find((a) => a.templateId === tplId)
      if (created) openSession(created.id, created.name, created.icon)
    } finally {
      setNewing(false)
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        height: '100%',
        minHeight: 0,
        fontFamily: 'MS Sans Serif, Arial, sans-serif',
      }}
    >
      {/* Header */}
      <div style={{ ...OUTSET, padding: '6px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>💬</span>
        <b>Chat Center</b>
        <span style={{ fontSize: 10, color: '#333' }}>
          {agents.length} session{agents.length === 1 ? '' : 's'} · each opens as its own window
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: '#333' }}>
          {mode === 'llm' ? '⚡ LLM mode' : '⏸ Rule mode'}
        </span>
      </div>

      {/* Templates */}
      <div style={{ ...OUTSET, padding: 6 }}>
        <div style={{ fontSize: 10, borderBottom: '1px solid #808080', paddingBottom: 2, marginBottom: 4 }}>
          New chat from template
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {templates.map((t) => (
            <button
              key={t.id}
              style={{ ...BTN, textAlign: 'left' }}
              disabled={newing}
              onClick={() => void startFromTemplate(t.id)}
              title={t.description}
            >
              {t.icon} {t.name}
            </button>
          ))}
          <button
            style={{ ...BTN, textAlign: 'left' }}
            disabled={newing}
            onClick={() => void startFromTemplate('general-chat')}
          >
            ➕ New Chat
          </button>
        </div>
      </div>

      {/* Sessions */}
      <div style={{ ...OUTSET, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: 6 }}>
        <div style={{ fontSize: 10, borderBottom: '1px solid #808080', paddingBottom: 2, marginBottom: 4 }}>
          Sessions (double-click to open)
        </div>
        <div style={{ ...INSET, flex: 1, overflow: 'auto', padding: 2 }}>
          {agents.length === 0 && (
            <div style={{ fontSize: 10, color: '#555', padding: 6 }}>No sessions yet.</div>
          )}
          {agents.map((a) => (
            <div
              key={a.id}
              onClick={() => openSession(a.id, a.name, a.icon)}
              onDoubleClick={() => openSession(a.id, a.name, a.icon)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '5px 6px',
                marginBottom: 1,
                cursor: 'pointer',
                border: '1px solid transparent',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#000080'
                e.currentTarget.style.color = '#fff'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = '#000'
              }}
            >
              <span style={{ fontSize: 14 }}>{a.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700 }}>{a.name}</div>
                <div style={{ fontSize: 9, opacity: 0.85 }}>
                  {a.status}
                  {a.symbols.length > 0 ? ` · ${a.symbols.join(', ')}` : ''} ·{' '}
                  {a.messages.length} msgs
                </div>
              </div>
              <button
                style={{ ...BTN, padding: '2px 8px' }}
                onClick={(e) => {
                  e.stopPropagation()
                  openSession(a.id, a.name, a.icon)
                }}
              >
                Open
              </button>
            </div>
          ))}
        </div>
      </div>

      {mode !== 'llm' && (
        <div style={{ ...OUTSET, padding: 6, fontSize: 10 }}>
          ⏸ Rule mode — chat needs an LLM key.{' '}
          <button style={{ ...BTN, padding: '2px 8px' }} onClick={() => openWindow('settings', 'Settings', '⚙️')}>
            Open Settings
          </button>
        </div>
      )}
    </div>
  )
}

export default ChatCenter
