/**
 * Agents view - multi-agent control panel.
 *
 * Agents run in the main process (same security boundary as the wallet
 * vault). This view lists agent instances, lets you create / start /
 * stop / run-on-demand / remove them, and shows each agent's live output
 * stream. Wallet access is gated by the explicit authorization done in
 * the Wallets view; agents never see secrets.
 */

import React, { useCallback, useEffect, useState } from 'react'
import { useAgentStore } from '../stores/agentStore'
import type { AgentInstanceView, AgentTemplateView } from '../stores/agentStore'

const STATUS_COLOR: Record<string, string> = {
  idle: '#8b949e',
  running: '#58a6ff',
  completed: '#3fb950',
  error: '#f85149',
  stopped: '#6e7681',
}

const btnBase: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: '6px',
  border: '1px solid var(--color-border)',
  background: 'var(--color-bg-tertiary)',
  color: 'var(--color-text-primary)',
  fontSize: 'var(--font-sm)',
  cursor: 'pointer',
  fontWeight: 500,
}

const btnPrimary: React.CSSProperties = {
  ...btnBase,
  background: 'var(--color-accent)',
  borderColor: 'var(--color-accent)',
  color: '#fff',
}

const btnDanger: React.CSSProperties = {
  ...btnBase,
  color: 'var(--color-danger)',
  borderColor: 'rgba(248,81,73,0.4)',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '4px 8px',
  borderRadius: 0,
  border: '2px inset',
  borderColor: '#808080 #fff #fff #808080',
  background: 'var(--color-bg-tertiary)',
  color: 'var(--color-text-primary)',
  fontSize: 12,
}

const cardStyle: React.CSSProperties = {
  background: 'var(--color-bg-secondary)',
  border: '2px outset',
  borderColor: '#fff #808080 #808080 #fff',
  padding: 10,
}

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
  const { start, stop, remove, runOnce } = useAgentStore()
  const [expanded, setExpanded] = useState(false)
  const template = templates.find((t) => t.id === agent.templateId)
  const running = agent.status === 'running'

  const messages = agent.messages
  const lastMsgs = expanded ? messages : messages.slice(-3)

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 'var(--font-xl)' }}>{agent.icon}</span>
        <div>
          <h3 style={{ margin: 0, fontSize: 'var(--font-lg)' }}>{agent.name}</h3>
          <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-xs)' }}>
            {template?.name ?? agent.templateId} · {agent.symbols.join(', ')} · every{' '}
            {Math.round(agent.intervalMs / 1000)}s
          </span>
        </div>
        <span
          style={{
            fontSize: 'var(--font-xs)',
            padding: '2px 10px',
            borderRadius: 999,
            background: `${STATUS_COLOR[agent.status] ?? '#8b949e'}22`,
            color: STATUS_COLOR[agent.status] ?? '#8b949e',
            border: `1px solid ${STATUS_COLOR[agent.status] ?? '#8b949e'}55`,
          }}
        >
          ● {agent.status}
        </span>
        <span
          style={{
            fontSize: 'var(--font-xs)',
            padding: '2px 10px',
            borderRadius: 999,
            background:
              agent.mode === 'llm' ? 'rgba(210,153,34,0.15)' : 'rgba(139,148,158,0.15)',
            color: agent.mode === 'llm' ? 'var(--color-warning)' : 'var(--color-text-secondary)',
          }}
        >
          {agent.mode === 'llm' ? 'LLM' : 'Rule'}
        </span>
        <span style={{ flex: 1 }} />
        {running ? (
          <button style={btnBase} onClick={() => void stop(agent.id).then(onChanged)}>
            Stop
          </button>
        ) : (
          <button style={btnPrimary} onClick={() => void start(agent.id).then(onChanged)}>
            Start
          </button>
        )}
        <button style={btnBase} onClick={() => void runOnce(agent.id).then(onChanged)}>
          Run now
        </button>
        <button style={btnDanger} onClick={() => void remove(agent.id).then(onChanged)}>
          Remove
        </button>
        <button style={btnBase} onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Collapse' : `Log (${messages.length})`}
        </button>
      </div>

      {agent.lastMessage && !expanded && (
        <pre
          style={{
            margin: 'var(--space-md) 0 0',
            padding: 'var(--space-md)',
            background: 'var(--color-bg-tertiary)',
            borderRadius: 8,
            fontSize: 'var(--font-xs)',
            color: 'var(--color-text-secondary)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            maxHeight: 96,
            overflow: 'auto',
          }}
        >
          {agent.lastMessage}
        </pre>
      )}

      {expanded && (
        <div
          style={{
            marginTop: 'var(--space-md)',
            maxHeight: 260,
            overflow: 'auto',
            background: 'var(--color-bg-tertiary)',
            borderRadius: 8,
            padding: 'var(--space-sm)',
          }}
        >
          {lastMsgs.length === 0 && (
            <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: 'var(--font-xs)' }}>
              No output yet. Start the agent or press "Run now".
            </p>
          )}
          {lastMsgs.map((m) => (
            <div
              key={m.id}
              style={{
                display: 'flex',
                gap: 8,
                padding: '3px 0',
                fontSize: 'var(--font-xs)',
                color:
                  m.kind === 'error'
                    ? 'var(--color-danger)'
                    : m.kind === 'step'
                      ? 'var(--color-text-muted)'
                      : 'var(--color-text-primary)',
              }}
            >
              <span style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}>
                {fmtTime(m.at)}
              </span>
              <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.content}</span>
            </div>
          ))}
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

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Subscribe to the live agent event stream from the main process.
  useEffect(() => {
    const handler = (event: unknown) => {
      useAgentStore.getState().applyEvent(event as ReturnType<typeof useAgentStore.getState>['applyEvent'] extends (e: infer E) => void ? E : never)
    }
    window.vibeAPI.on('agent:event', handler)
    // The app shell never unmounts this view; listener persists for the
    // session (unmatched agent ids are no-ops).
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
    })
    setName('')
    setSymbols('')
  }, [templateId, name, symbols, create])

  return (
    <div style={{ padding: 10, maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>Agents</h2>
        <span
          style={{
            fontSize: 'var(--font-xs)',
            padding: '3px 10px',
            borderRadius: 999,
            background:
              mode === 'llm' ? 'rgba(210,153,34,0.15)' : 'rgba(139,148,158,0.15)',
            color: mode === 'llm' ? 'var(--color-warning)' : 'var(--color-text-secondary)',
          }}
        >
          {mode === 'llm' ? '⚡ LLM mode (OpenAI-compatible)' : 'Rule mode (no LLM key)'}
        </span>
        <span
          style={{
            fontSize: 'var(--font-xs)',
            color: 'var(--color-text-muted)',
          }}
        >
          {agents.length} instance{agents.length === 1 ? '' : 's'} running in the main process
        </span>
        <span style={{ flex: 1 }} />
      </div>

      {mode === 'rule' && (
        <div
          style={{
            marginTop: 8,
            padding: '6px 10px',
            borderRadius: 0,
            background: 'rgba(210,153,34,0.08)',
            border: '2px inset',
            borderColor: '#808080 #fff #fff #808080',
            color: 'var(--color-warning)',
            fontSize: 'var(--font-sm)',
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
            borderRadius: 0,
            background: 'rgba(248,81,73,0.1)',
            border: '1px solid rgba(248,81,73,0.3)',
            color: 'var(--color-danger)',
            fontSize: 'var(--font-sm)',
          }}
        >
          {error}
        </div>
      )}

      {/* Create agent */}
      <div style={{ ...cardStyle, marginTop: 'var(--space-lg)' }}>
        <h3 style={{ marginTop: 0 }}>Create an agent</h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 12,
          }}
        >
          <div>
            <label style={{ display: 'block', fontSize: 'var(--font-sm)', color: 'var(--color-text-secondary)', marginBottom: 4 }}>
              Template
            </label>
            <select
              style={inputStyle}
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
            >
              <option value="">Select…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.icon} {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--font-sm)', color: 'var(--color-text-secondary)', marginBottom: 4 }}>
              Name (optional)
            </label>
            <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--font-sm)', color: 'var(--color-text-secondary)', marginBottom: 4 }}>
              Symbols (comma-separated)
            </label>
            <input style={inputStyle} value={symbols} onChange={(e) => setSymbols(e.target.value)} placeholder="TSLA, NVDA" />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button style={btnPrimary} onClick={() => void onSubmit()} disabled={!templateId || loading}>
              Create &amp; Start
            </button>
          </div>
        </div>
        {templateId && (
          <p style={{ margin: 'var(--space-md) 0 0', color: 'var(--color-text-secondary)', fontSize: 'var(--font-xs)' }}>
            {templates.find((t) => t.id === templateId)?.description}
          </p>
        )}
      </div>

      {/* Agent list */}
      <div style={{ display: 'grid', gap: 'var(--space-lg)', marginTop: 'var(--space-lg)' }}>
        {agents.length === 0 && !loading && (
          <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-sm)' }}>
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
