/**
 * ChatWindow - a single chat session as its own desktop window.
 *
 * Each session (agent instance) gets its own window, so the user can
 * keep several conversations open and minimize them to the taskbar
 * independently - like a classic IM client.
 *
 * The window consumes a ChatIntent when present (e.g. Trade Center
 * "Ask AI"): if the intent targets this agent it auto-sends the
 * pre-filled question.
 */

import React, { useEffect, useRef, useState } from 'react'
import { useAgentStore } from '../stores/agentStore'
import { useWindowStore } from '../components/95/windowStore'

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

const ChatWindow: React.FC<{ agentId: string }> = ({ agentId }) => {
  const { agents, mode, refresh, chat } = useAgentStore()
  const chatIntent = useWindowStore((s) => s.chatIntent)
  const consumeChatIntent = useWindowStore((s) => s.consumeChatIntent)
  const openWindow = useWindowStore((s) => s.openWindow)

  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [bootstrapped, setBootstrapped] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  const agent = agents.find((a) => a.id === agentId) ?? null
  const canChat = mode === 'llm' && agent !== null

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Keep this session live: apply main-process events so new messages
  // (including replies from this window's own chat calls) show up.
  useEffect(() => {
    const handler = (event: unknown) => {
      useAgentStore.getState().applyEvent(
        event as Parameters<ReturnType<typeof useAgentStore.getState>['applyEvent']>[0],
      )
    }
    window.vibeAPI.on('agent:event', handler)
    return () => window.vibeAPI.off('agent:event', handler)
  }, [])

  // Consume a chat intent addressed to this session.
  useEffect(() => {
    if (!chatIntent || chatIntent.agentId !== agentId) return
    const { question } = chatIntent
    consumeChatIntent()
    if (!question) return
    setSending(true)
    void (async () => {
      try {
        await refresh()
        await chat(agentId, question)
      } catch {
        // errors surface through the event stream
      } finally {
        setSending(false)
      }
    })()
  }, [chatIntent, agentId, chat, refresh, consumeChatIntent])

  // Auto-scroll to the newest message.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [agent?.messages.length, bootstrapped])

  const send = async (): Promise<void> => {
    const text = input.trim()
    if (!text || sending || !agent || mode !== 'llm') return
    setSending(true)
    setInput('')
    try {
      await chat(agent.id, text)
    } catch {
      // errors surface through the event stream
    } finally {
      setSending(false)
    }
  }

  if (!agent) {
    return (
      <div style={{ padding: 16, fontSize: 11, color: '#555', fontFamily: 'MS Sans Serif, Arial, sans-serif' }}>
        Session not found (it may have been removed). Close this window and reopen the chat from Chat Center.
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        fontFamily: 'MS Sans Serif, Arial, sans-serif',
      }}
    >
      {/* Header */}
      <div
        style={{
          borderBottom: '2px inset',
          borderColor: '#808080 #fff #fff #808080',
          padding: '5px 10px',
          background: '#c0c0c0',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
        }}
      >
        <span>{agent.icon}</span>
        <span style={{ fontSize: 12, fontWeight: 700 }}>{agent.name}</span>
        {agent.symbols.length > 0 && (
          <span style={{ fontSize: 10, color: '#333' }}>· {agent.symbols.join(', ')}</span>
        )}
        <span style={{ fontSize: 10, color: '#333' }}>· {agent.status}</span>
        <div style={{ flex: 1 }} />
        <button
          style={BTN}
          onClick={() => openWindow('chat-center', 'Chat Center', '💬', { width: 340, height: 440 })}
        >
          Sessions
        </button>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: 8,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          background: '#fff',
          borderLeft: '2px inset',
          borderRight: '2px inset',
          borderColor: '#808080 #fff #fff #808080',
        }}
      >
        {agent.messages.length === 0 && (
          <div style={{ fontSize: 11, color: '#666', padding: 4 }}>
            {mode === 'llm'
              ? `Chat with ${agent.name}. Ask about a stock, the market or your portfolio.`
              : 'Rule mode: configure an LLM key in Settings to start chatting.'}
          </div>
        )}
        {agent.messages.map((m, i) => {
          const prev = agent.messages[i - 1]
          const isDup =
            m.kind === 'step' && prev && prev.role === 'user' && prev.content === m.content
          if (isDup) return null
          if (m.role === 'user') {
            return (
              <div key={m.id} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <span
                  style={{
                    maxWidth: '82%',
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
                  maxWidth: '82%',
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
                  {agent.name} · {fmtTime(m.at)}
                </span>
                {m.content}
              </span>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      {/* Composer */}
      <div
        style={{
          borderTop: '2px outset',
          borderColor: '#fff #808080 #808080 #fff',
          padding: 6,
          background: '#c0c0c0',
          display: 'flex',
          gap: 6,
          flexShrink: 0,
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
        <button style={BTN} onClick={() => void send()} disabled={!canChat || sending}>
          {sending ? '…' : 'Send'}
        </button>
      </div>
    </div>
  )
}

export default ChatWindow
