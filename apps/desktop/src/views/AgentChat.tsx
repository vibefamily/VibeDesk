/**
 * Agent Chat view - conversational AI trading agent interface.
 */

import React, { useState, useRef, useEffect } from 'react'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  thinking?: boolean
  toolCalls?: { name: string; status: 'running' | 'done' | 'error'; result?: string }[]
}

const AgentChat: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      role: 'assistant',
      content:
        "👋 Hi, I'm your AI trading assistant. I can help you with:\n\n• 📊 Market analysis and price queries\n• 📈 Strategy suggestions and backtesting\n• 💼 Portfolio review and risk checks\n• 🔄 Cross-chain stock token arbitrage opportunities\n\nWhat would you like to do today?",
      timestamp: Date.now(),
    },
  ])
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSend = () => {
    if (!input.trim()) return

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: Date.now(),
    }

    const thinkingMsg: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      thinking: true,
      toolCalls: [{ name: 'get_price', status: 'running' }],
    }

    setMessages((prev) => [...prev, userMsg, thinkingMsg])
    setInput('')

    // Simulate agent response (replace with real agent integration)
    setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === thinkingMsg.id
            ? {
                ...m,
                thinking: false,
                toolCalls: [{ name: 'get_price', status: 'done', result: 'BTC/USDT: $67,432.50' }],
                content:
                  "Current BTC price is **$67,432.50**, up 2.34% in 24 hours.\n\nHere's my analysis:\n\n1. **Trend**: Short-term bullish, price above 20-day MA\n2. **Momentum**: RSI at 62 — no overbought condition yet\n3. **Volume**: 24h volume up 15% from average\n\nWould you like me to:\n• Run a backtest of the SMA Cross strategy on BTC?\n• Check for arbitrage opportunities across exchanges?\n• Place a trade?",
              }
            : m,
        ),
      )
    }, 1500)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const quickPrompts = [
    "What's the price of BTC?",
    'Show me my portfolio',
    'Run a backtest',
    'Find arbitrage opportunities',
  ]

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: 'var(--space-lg) var(--space-xl)',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-md)',
        }}
      >
        <span style={{ fontSize: 'var(--font-xl)' }}>🤖</span>
        <div>
          <h2 style={{ margin: 0, fontSize: 'var(--font-lg)' }}>VibeDesk Agent</h2>
          <p style={{ margin: 0, fontSize: 'var(--font-sm)', color: 'var(--color-text-secondary)' }}>
            Ask me anything about markets, strategies, or your portfolio
          </p>
        </div>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 'var(--space-xl)',
        }}
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              display: 'flex',
              gap: 'var(--space-md)',
              marginBottom: 'var(--space-lg)',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            {msg.role === 'assistant' && (
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  backgroundColor: 'var(--color-accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  fontSize: 'var(--font-md)',
                }}
              >
                🤖
              </div>
            )}
            <div
              style={{
                maxWidth: '70%',
                padding: 'var(--space-md) var(--space-lg)',
                borderRadius: 'var(--radius-lg)',
                backgroundColor:
                  msg.role === 'user'
                    ? 'var(--color-accent)'
                    : 'var(--color-bg-secondary)',
                color: msg.role === 'user' ? 'white' : 'var(--color-text-primary)',
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {msg.thinking ? (
                <div style={{ display: 'flex', gap: 'var(--space-xs)', alignItems: 'center' }}>
                  <span>Thinking</span>
                  <span style={{ animation: 'pulse 1.5s infinite' }}>...</span>
                </div>
              ) : (
                msg.content
              )}
              {msg.toolCalls && msg.toolCalls.length > 0 && (
                <div
                  style={{
                    marginTop: 'var(--space-sm)',
                    padding: 'var(--space-sm) var(--space-md)',
                    backgroundColor: 'var(--color-bg-tertiary)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: 'var(--font-sm)',
                  }}
                >
                  {msg.toolCalls.map((tc, i) => (
                    <div key={i} style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
                      <span>{tc.status === 'running' ? '⏳' : tc.status === 'done' ? '✅' : '❌'}</span>
                      <code style={{ fontFamily: 'monospace' }}>{tc.name}</code>
                      {tc.result && <span className="text-muted">→ {tc.result}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {msg.role === 'user' && (
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  backgroundColor: 'var(--color-bg-tertiary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                👤
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick prompts */}
      {messages.length <= 1 && (
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-sm)',
            padding: '0 var(--space-xl) var(--space-md)',
            flexWrap: 'wrap',
          }}
        >
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              onClick={() => {
                setInput(prompt)
                setTimeout(() => handleSend(), 100)
              }}
              style={{
                padding: 'var(--space-sm) var(--space-md)',
                backgroundColor: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--color-text-secondary)',
                fontSize: 'var(--font-sm)',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-accent)'
                e.currentTarget.style.color = 'var(--color-accent)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-border)'
                e.currentTarget.style.color = 'var(--color-text-secondary)'
              }}
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div
        style={{
          padding: 'var(--space-lg) var(--space-xl)',
          borderTop: '1px solid var(--color-border)',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-md)',
            alignItems: 'flex-end',
          }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about markets, strategies, or your portfolio..."
            rows={1}
            style={{
              flex: 1,
              resize: 'none',
              maxHeight: 120,
              minHeight: 40,
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-md)',
              backgroundColor: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-primary)',
              fontFamily: 'inherit',
              fontSize: 'var(--font-md)',
              outline: 'none',
              lineHeight: 1.5,
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            style={{
              padding: 'var(--space-md) var(--space-lg)',
              backgroundColor: 'var(--color-accent)',
              color: 'white',
              borderRadius: 'var(--radius-lg)',
              fontWeight: 600,
              cursor: input.trim() ? 'pointer' : 'not-allowed',
              opacity: input.trim() ? 1 : 0.5,
              transition: 'opacity 0.15s',
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}

export default AgentChat
