/**
 * Agents view - multi-agent control panel (Windows 95 style).
 *
 * Agents run in the main process (same security boundary as the wallet
 * vault). This view lists agent instances, lets you create / start /
 * stop / run-on-demand / remove them, and shows each agent's live output
 * stream. Wallet access is gated by the explicit authorization done in
 * the Wallets view; agents never see secrets.
 */

import React, { useCallback, useEffect, useState } from 'react'
import { useAgentStore } from '../stores/agentStore'
import AgentConfigPanel from '../components/AgentConfigPanel'
import type { AgentInstanceView, AgentTemplateView } from '../stores/agentStore'

const STATUS_COLOR: Record<string, string> = {
  idle: '#000',
  running: '#06f',
  completed: '#060',
  error: '#a00',
  stopped: '#666',
}

const btn: React.CSSProperties = {
  padding: '4px 12px',
  background: '#c0c0c0',
  border: '2px outset',
  borderColor: '#fff #808080 #808080 #fff',
  color: '#000',
  fontSize: 11,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const btnPrimary: React.CSSProperties = {
  ...btn,
  fontWeight: 700,
}

const btnDanger: React.CSSProperties = {
  ...btn,
  color: '#a00',
}

const input: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '4px 6px',
  fontSize: 12,
  border: '2px inset',
  borderColor: '#808080 #fff #fff #808080',
  background: '#fff',
  color: '#000',
  caretColor: '#000',
}

const label: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  color: '#000',
  marginBottom: 3,
}

const card: React.CSSProperties = {
  background: '#c0c0c0',
  border: '2px outset',
  borderColor: '#fff #808080 #808080 #fff',
  padding: 8,
}

/** Small Windows-95 style status chip (inset, coloured text). */
const Chip: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color }) => (
  <span
    style={{
      fontSize: 10,
      border: '1px inset',
      borderColor: '#808080 #fff #fff #808080',
      padding: '1px 6px',
      background: '#c0c0c0',
      color: color ?? '#000',
      whiteSpace: 'nowrap',
    }}
  >
    {children}
  </span>
)

function fmtTime(ts: number | null): string {
  if (!ts) return 'never'
  return new Date(ts).toLocaleTimeString()
}

// --- Agent card -------------------------------------------------------------

const AgentCard: React.FC<{
  agent: AgentInstanceView
  templates: AgentTemplateView[]
  onChanged: () => void
}> = ({ agent, templates, onChanged }) => {
  const {
    start,
    stop,
    remove,
    runOnce,
    chat,
    setDataSourceAuth,
    setWalletAuth,
    setIntervalMs,
    dataSources,
  } = useAgentStore()
  const [expanded, setExpanded] = useState(false)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [dsSel, setDsSel] = useState<string[]>(agent.dataSources)
  const [waSel, setWaSel] = useState<string[]>(agent.walletAuths)
  const [authSaved, setAuthSaved] = useState(false)
  const [intervalSec, setIntervalSec] = useState(String(Math.round(agent.intervalMs / 1000)))
  const [intervalSaved, setIntervalSaved] = useState(false)

  const sendChat = async () => {
    const text = input.trim()
    if (!text || sending || agent.mode !== 'llm') return
    setSending(true)
    setInput('')
    try {
      await chat(agent.id, text)
    } catch {
      // Chat errors surface through the agent event stream / status badge.
    } finally {
      setSending(false)
    }
  }
  const template = templates.find((t) => t.id === agent.templateId)
  const running = agent.status === 'running'

  const messages = agent.messages
  const lastMsgs = expanded ? messages : messages.slice(-3)

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 16 }}>{agent.icon}</span>
        <div>
          <h3 style={{ margin: 0, fontSize: 14, color: '#000' }}>{agent.name}</h3>
          <span style={{ color: '#000', fontSize: 10 }}>
            {template?.name ?? agent.templateId} · {agent.symbols.join(', ')} · every{' '}
            {Math.round(agent.intervalMs / 1000)}s
          </span>
        </div>
        <Chip color={STATUS_COLOR[agent.status] ?? '#000'}>{agent.status}</Chip>
        <Chip color={agent.mode === 'llm' ? '#960' : '#666'}>
          {agent.mode === 'llm' ? 'LLM' : 'Rule'}
        </Chip>
        <span style={{ flex: 1 }} />
        {running ? (
          <button style={btn} onClick={() => void stop(agent.id).then(onChanged)}>
            Stop
          </button>
        ) : (
          <button style={btnPrimary} onClick={() => void start(agent.id).then(onChanged)}>
            Start
          </button>
        )}
        <button style={btn} onClick={() => void runOnce(agent.id).then(onChanged)}>
          Run now
        </button>
        <button style={btnDanger} onClick={() => void remove(agent.id).then(onChanged)}>
          Remove
        </button>
        <button style={btn} onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Collapse' : `Log (${messages.length})`}
        </button>
        <button
          style={btnPrimary}
          onClick={() => {
            setDsSel(agent.dataSources)
            setWaSel(agent.walletAuths)
            setExpanded(true)
          }}
        >
          Configure
        </button>
      </div>

      {agent.lastMessage && !expanded && (
        <pre
          style={{
            margin: '8px 0 0',
            padding: 6,
            background: '#fff',
            border: '2px inset',
            borderColor: '#808080 #fff #fff #808080',
            fontSize: 11,
            color: '#000',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            maxHeight: 96,
            overflow: 'auto',
            fontFamily: 'inherit',
          }}
        >
          {agent.lastMessage}
        </pre>
      )}

      {expanded && (
        <div
          style={{
            marginTop: 8,
            border: '2px inset',
            borderColor: '#808080 #fff #fff #808080',
            background: '#c0c0c0',
            padding: 6,
          }}
        >
          {/* Run interval (M5-4) */}
          <div
            style={{
              border: '2px inset',
              borderColor: '#808080 #fff #fff #808080',
              background: '#c0c0c0',
              padding: 6,
              marginBottom: 8,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 'bold', color: '#000', marginBottom: 4 }}>
              Run interval (long-running agent)
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="number"
                min={0}
                step={5}
                value={intervalSec}
                onChange={(e) => setIntervalSec(e.target.value)}
                style={{
                  width: 80,
                  background: '#fff',
                  color: '#000',
                  border: '2px inset',
                  borderColor: '#808080 #fff #fff #808080',
                  padding: '2px 6px',
                  fontSize: 11,
                  fontFamily: 'inherit',
                }}
              />
              <span style={{ fontSize: 11, color: '#000' }}>seconds (0 = off)</span>
              <button
                style={btnPrimary}
                onClick={async () => {
                  const sec = Math.max(0, Number(intervalSec) || 0)
                  await setIntervalMs(agent.id, sec * 1000)
                  setIntervalSaved(true)
                  setTimeout(() => setIntervalSaved(false), 1500)
                  onChanged()
                }}
              >
                Apply
              </button>
              {intervalSaved && <span style={{ fontSize: 10, color: '#060' }}>Saved.</span>}
            </div>
            <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>
              While running, the agent re-analyzes live multi-source data every interval.
            </div>
          </div>

          {/* Per-agent authorization: data sources + wallets - shared panel */}
          <AgentConfigPanel
            agentId={agent.id}
            initialDataSources={agent.dataSources}
            initialWalletAuths={agent.walletAuths}
            onSaved={onChanged}
          />

          {/* Chat: user lines (right) + agent replies (left) + steps */}
          <div
            style={{
              maxHeight: 220,
              overflow: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            {lastMsgs.length === 0 && (
              <p style={{ margin: 0, color: '#666', fontSize: 11 }}>
                No activity yet. Start the agent, press "Run now", or send a message below.
              </p>
            )}
            {lastMsgs.map((m, i) => {
              const prev = lastMsgs[i - 1]
              const isDupUserStep =
                m.kind === 'step' && prev && prev.role === 'user' && prev.content === m.content
              if (isDupUserStep) return null
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
                        color: '#000',
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
                      color: '#000',
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
          </div>

          {/* Chat input */}
          <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void sendChat()
              }}
              placeholder={
                agent.mode === 'llm'
                  ? 'Message this agent… (Enter to send)'
                  : 'Chat needs LLM mode - add an API key or Ollama in Settings > AI Models'
              }
              disabled={agent.mode !== 'llm' || sending}
              style={{
                flex: 1,
                padding: '4px 6px',
                fontSize: 11,
                border: '2px inset',
                borderColor: '#808080 #fff #fff #808080',
                background: agent.mode === 'llm' ? '#fff' : '#e8e8e8',
                color: agent.mode === 'llm' ? '#000' : '#999',
                caretColor: '#000',
              }}
            />
            <button
              style={{
                padding: '4px 12px',
                fontSize: 11,
                background: '#c0c0c0',
                border: '2px outset',
                borderColor: '#fff #808080 #808080 #fff',
                cursor: agent.mode === 'llm' && !sending ? 'pointer' : 'default',
                fontWeight: 700,
              }}
              onClick={() => void sendChat()}
              disabled={agent.mode !== 'llm' || sending}
            >
              {sending ? '…' : 'Send'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// --- Main view --------------------------------------------------------------

const Agents: React.FC = () => {
  const { templates, agents, mode, loading, error, refresh, create } = useAgentStore()
  const [templateId, setTemplateId] = useState('')
  const [name, setName] = useState('')
  const [symbols, setSymbols] = useState('')
  const [desktopIcon, setDesktopIcon] = useState(true)

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Subscribe to the live agent event stream from the main process.
  useEffect(() => {
    const handler = (event: unknown) => {
      useAgentStore.getState().applyEvent(event as ReturnType<typeof useAgentStore.getState>['applyEvent'] extends (e: infer E) => void ? E : never)
    }
    const unsubscribe = window.vibeAPI.on('agent:event', handler)
    // Use the `on` cleanup so the exact listener is removed on unmount
    // (prevents duplicate event application when windows open/close).
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe()
    }
  }, [])

  const onSubmit = useCallback(async () => {
    if (!templateId) return
    await create({
      templateId,
      name: name.trim() || undefined,
      symbols: symbols
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean),
      desktopIcon,
    })
    setName('')
    setSymbols('')
  }, [templateId, name, symbols, desktopIcon, create])

  return (
    <div style={{ padding: 10, maxWidth: 900, background: '#c0c0c0', color: '#000' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 16, color: '#000' }}>Agents</h2>
        <Chip color={mode === 'llm' ? '#960' : '#666'}>
          {mode === 'llm' ? '⚡ LLM mode (OpenAI-compatible)' : 'Rule mode (no LLM key)'}
        </Chip>
        <span style={{ fontSize: 11, color: '#000' }}>
          {agents.length} instance{agents.length === 1 ? '' : 's'} running in the main process
        </span>
        <span style={{ flex: 1 }} />
      </div>

      {mode === 'rule' && (
        <div
          style={{
            marginTop: 8,
            padding: '6px 10px',
            border: '2px inset',
            borderColor: '#808080 #fff #fff #808080',
            background: '#c0c0c0',
            color: '#960',
            fontSize: 11,
          }}
        >
          No LLM API key configured - agents run in deterministic rule mode on live multi-source
          prices. Add a key in Settings to unlock LLM analysis.
        </div>
      )}

      {error && (
        <div
          style={{
            marginTop: 8,
            padding: '6px 10px',
            border: '2px inset',
            borderColor: '#808080 #fff #fff #808080',
            background: '#c0c0c0',
            color: '#a00',
            fontSize: 11,
          }}
        >
          {error}
        </div>
      )}

      {/* Create agent */}
      <div style={{ ...card, marginTop: 12 }}>
        <h3 style={{ marginTop: 0, fontSize: 14, color: '#000' }}>Create an agent</h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 8,
          }}
        >
          <div>
            <label style={label}>Template</label>
            <select style={input} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              <option value="">Select…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.icon} {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={label}>Name (optional)</label>
            <input style={input} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label style={label}>Symbols (comma-separated)</label>
            <input
              style={input}
              value={symbols}
              onChange={(e) => setSymbols(e.target.value)}
              placeholder="TSLA, NVDA"
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ ...label, display: 'flex', alignItems: 'center', gap: 4, margin: 0, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={desktopIcon}
                onChange={(e) => setDesktopIcon(e.target.checked)}
                style={{ margin: 0 }}
              />
              <span style={{ fontSize: 11, color: '#000' }}>Desktop shortcut</span>
            </label>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button style={btnPrimary} onClick={() => void onSubmit()} disabled={!templateId || loading}>
              Create &amp; Start
            </button>
          </div>
        </div>
        {templateId && (
          <p style={{ margin: '8px 0 0', color: '#000', fontSize: 11 }}>
            {templates.find((t) => t.id === templateId)?.description}
          </p>
        )}
      </div>

      {/* Agent list */}
      <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
        {agents.length === 0 && !loading && (
          <p style={{ fontSize: 11, color: '#000' }}>
            No agents yet. Pick a template above to create your first one.
          </p>
        )}
        {agents.map((agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            templates={templates}
            onChanged={() => void refresh()}
          />
        ))}
      </div>
    </div>
  )
}

export default Agents
