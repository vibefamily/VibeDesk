/**
 * Chat Center - the default home screen of VibeDesk.
 *
 * A Windows-95 style chat workspace: sessions on the left (created from
 * templates), the conversation on the right. Every session is a real
 * AgentManager instance, so the assistant can call live market tools,
 * read the info cache and answer with real data.
 *
 * Cross-window intents (e.g. "Ask AI" in Trade Center) can open the chat
 * center focused on a stock-specific session with a pre-filled question.
 */

import React, { useEffect, useRef, useState } from 'react'
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

function fmtTime(ts: number | null): string {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const ChatCenter: React.FC = () => {
  const { templates, agents, mode, loading, refresh, create, chat } = useAgentStore()
  const chatIntent = useWindowStore((s) => s.chatIntent)
  const consumeChatIntent = useWindowStore((s) => s.consumeChatIntent)
  const openWindow = useWindowStore((s) => s.openWindow)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [newing, setNewing] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  const selected = agents.find((a) => a.id === selectedId) ?? null

  // Keep the agent list in sync with the main process.
  useEffect(() => {
    void refresh()
  }, [refresh])

  // Bootstrap: always ensure a General Chat session exists and select it.
  useEffect(() => {
    if (loading) return
    if (agents.length === 0) {
      void create({ templateId: 'general-chat', name: 'General Chat' })
      return
    }
    if (!selectedId) {
      const general = agents.find((a) => a.templateId === 'general-chat')
      setSelectedId(general?.id ?? agents[0]!.id)
    }
  }, [loading, agents, selectedId, create])

  // Consume cross-window chat intents (Trade Center "Ask AI").
  useEffect(() => {
    if (!chatIntent) return
    const intent = chatIntent
    const existing = agents.find(
      (a) =>
        a.templateId === intent.templateId &&
        (intent.symbols ?? []).length > 0 &&
        a.symbols.join(',') === intent.symbols!.join(','),
    )
    const run = async (): Promise<string | null> => {
      if (existing) return existing.id
      const tpl = templates.find((t) => t.id === intent.templateId) ?? templates[0]
      await create({
        templateId: tpl?.id ?? 'general-chat',
        name: intent.title ?? tpl?.name ?? 'Chat',
        symbols: intent.symbols,
      })
      const created = agents.find(
        (a) =>
          a.templateId === intent.templateId &&
          (intent.symbols ?? []).length > 0 &&
          a.symbols.join(',') === intent.symbols!.join(','),
      )
      return created?.id ?? null
    }
    void (async () => {
      const id = await run()
      if (id) setSelectedId(id)
      if (id && intent.question && mode === 'llm') {
        setSending(true)
        try {
          await chat(id, intent.question)
        } catch {
          // errors surface through the event stream
        } finally {
          setSending(false)
        }
      }
    })()
    consumeChatIntent()
  }, [chatIntent, agents, templates, mode, create, refresh, chat, consumeChatIntent])

  // Auto-scroll to the newest message.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [selected?.messages.length, selectedId])

  const send = async (): Promise<void> => {
    const text = input.trim()
    if (!text || sending || !selected || mode !== 'llm') return
    setSending(true)
    setInput('')
    try {
      await chat(selected.id, text)
    } catch {
      // errors surface through the event stream
    } finally {
      setSending(false)
    }
  }

  const startNew = async (tplId: string): Promise<void> => {
    if (newing) return
    setNewing(true)
    const tpl = templates.find((t) => t.id === tplId)
    try {
      await create({ templateId: tplId, name: tpl?.name ?? 'Chat' })
      const created = agents.find((a) => a.templateId === tplId)
      if (created) setSelectedId(created.id)
    } finally {
      setNewing(false)
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        height: '100%',
        minHeight: 0,
        fontFamily: 'MS Sans Serif, Arial, sans-serif',
      }}
    >
      {/* Left: sessions panel */}
      <div
        style={{
          ...OUTSET,
          width: 212,
          padding: 6,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          flexShrink: 0,
        }}
      >
        <button style={BTN} onClick={() => void startNew('general-chat')} disabled={newing}>
          ➕ New Chat
        </button>

        <div style={{ fontSize: 10, borderBottom: '1px solid #808080', paddingBottom: 2 }}>
          New from template
        </div>
        {templates.map((t) => (
          <button
            key={t.id}
            onClick={() => void startNew(t.id)}
            disabled={newing}
            style={{ ...BTN, textAlign: 'left', padding: '3px 6px' }}
          >
            {t.icon} {t.name}
          </button>
        ))}

        <div
          style={{
            fontSize: 10,
            borderBottom: '1px solid #808080',
            paddingBottom: 2,
            marginTop: 4,
          }}
        >
          Sessions
        </div>
        <div style={{ ...INSET, flex: 1, overflow: 'auto', padding: 2, minHeight: 0 }}>
          {agents.length === 0 && (
            <div style={{ fontSize: 10, color: '#555', padding: 4 }}>No sessions yet.</div>
          )}
          {agents.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelectedId(a.id)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '4px 6px',
                marginBottom: 1,
                background: a.id === selectedId ? '#000080' : 'transparent',
                color: a.id === selectedId ? '#fff' : '#000',
                border: 'none',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              <span>
                {a.icon} {a.name}
              </span>
              <span style={{ display: 'block', fontSize: 9, opacity: 0.85 }}>
                {a.status}
                {a.symbols.length > 0 ? ` · ${a.symbols.join(',')}` : ''}
              </span>
            </button>
          ))}
        </div>

        <div style={{ fontSize: 10, borderTop: '1px solid #808080', paddingTop: 4 }}>
          {mode === 'llm' ? '⚡ LLM mode' : '⏸ Rule mode — chat needs an LLM key'}
          {mode !== 'llm' && (
            <button
              style={{ ...BTN, display: 'block', marginTop: 4, width: '100%' }}
              onClick={() => openWindow('settings', 'Settings', '⚙️')}
            >
              Open Settings
            </button>
          )}
        </div>
      </div>

      {/* Right: conversation */}
      <div
        style={{
          ...INSET,
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
        }}
      >
        {!selected ? (
          <div style={{ padding: 16, fontSize: 11, color: '#555' }}>
            Select a session or start a new chat from the left panel.
          </div>
        ) : (
          <>
            <div
              style={{
                borderBottom: '2px inset',
                borderColor: '#808080 #fff #fff #808080',
                padding: '6px 10px',
                background: '#c0c0c0',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span>{selected.icon}</span>
              <span style={{ fontSize: 12, fontWeight: 700 }}>{selected.name}</span>
              {selected.symbols.length > 0 && (
                <span style={{ fontSize: 10, color: '#333' }}>· {selected.symbols.join(', ')}</span>
              )}
              <span style={{ fontSize: 10, color: '#333' }}>· {selected.status}</span>
              <div style={{ flex: 1 }} />
              <button style={BTN} onClick={() => openWindow('agents', 'AI Agents', '🤖')}>
                Manage
              </button>
            </div>

            <div
              style={{
                flex: 1,
                overflow: 'auto',
                padding: 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                background: '#fff',
              }}
            >
              {selected.messages.length === 0 && (
                <div style={{ fontSize: 11, color: '#666', padding: 4 }}>
                  {mode === 'llm'
                    ? `Chat with ${selected.name}. Ask about a stock, the market or your portfolio.`
                    : 'Rule mode: configure an LLM key in Settings to start chatting.'}
                </div>
              )}
              {selected.messages.map((m, i) => {
                const prev = selected.messages[i - 1]
                const isDup =
                  m.kind === 'step' && prev && prev.role === 'user' && prev.content === m.content
                if (isDup) return null
                if (m.role === 'user') {
                  return (
                    <div key={m.id} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <span
                        style={{
                          maxWidth: '80%',
                          background: '#c0c0c0',
                          border: '2px outset',
                          borderColor: '#fff #808080 #808080 #fff',
                          padding: '4px 8px',
                          fontSize: 11,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}
                      >
                        {m.content}
                      </span>
                    </div>
                  )
                }
                if (m.kind === 'step') {
                  return (
                    <div key={m.id} style={{ fontSize: 10, color: '#666', fontStyle: 'italic' }}>
                      ⚙ {fmtTime(m.at)} {m.content}
                    </div>
                  )
                }
                if (m.kind === 'error') {
                  return (
                    <div key={m.id} style={{ fontSize: 11, color: '#a00', whiteSpace: 'pre-wrap' }}>
                      ✕ {m.content}
                    </div>
                  )
                }
                return (
                  <div key={m.id} style={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <span
                      style={{
                        maxWidth: '80%',
                        background: '#e5e5e5',
                        border: '2px outset',
                        borderColor: '#fff #808080 #808080 #fff',
                        padding: '4px 8px',
                        fontSize: 11,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      <span style={{ fontSize: 9, color: '#555', display: 'block' }}>
                        {selected.name} · {fmtTime(m.at)}
                      </span>
                      {m.content}
                    </span>
                  </div>
                )
              })}
              <div ref={endRef} />
            </div>

            <div
              style={{
                borderTop: '2px outset',
                borderColor: '#fff #808080 #808080 #fff',
                padding: 6,
                background: '#c0c0c0',
                display: 'flex',
                gap: 6,
              }}
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void send()
                  }
                }}
                placeholder={
                  mode === 'llm' ? 'Type a message…' : 'Configure an LLM key in Settings first'
                }
                disabled={mode !== 'llm'}
                style={{
                  flex: 1,
                  padding: '4px 6px',
                  fontSize: 11,
                  border: '2px inset',
                  borderColor: '#808080 #fff #fff #808080',
                  background: '#fff',
                  color: '#000',
                  fontFamily: 'inherit',
                }}
              />
              <button
                style={BTN}
                onClick={() => void send()}
                disabled={!selected || sending || mode !== 'llm'}
              >
                {sending ? '…' : 'Send'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default ChatCenter
