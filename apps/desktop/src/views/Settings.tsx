/**
 * Settings view - configure wallets, API keys, and application settings.
 */

import React, { useEffect, useState } from 'react'
import { useAgentStore } from '../stores/agentStore'
import { useWalletStore } from '../stores/walletStore'
import { useWindowStore } from '../components/95/windowStore'

type SettingsTab = 'general' | 'wallets' | 'exchanges' | 'risk' | 'models'

const Settings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')

  const tabs: { id: SettingsTab; label: string; icon: string }[] = [
    { id: 'general', label: 'General', icon: '⚙️' },
    { id: 'wallets', label: 'Wallets', icon: '🔐' },
    { id: 'exchanges', label: 'Exchanges', icon: '🏦' },
    { id: 'risk', label: 'Risk Management', icon: '🛡️' },
    { id: 'models', label: 'AI Models', icon: '🧠' },
  ]

  const renderContent = () => {
    switch (activeTab) {
      case 'general':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
            <SettingRow label="Theme" description="Choose your preferred color theme">
              <select defaultValue="system" style={{ ...ctl, width: 160 }}>
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </SettingRow>
            <SettingRow label="Language" description="Display language">
              <select defaultValue="en" style={{ ...ctl, width: 160 }}>
                <option value="en">English</option>
                <option value="zh">中文</option>
              </select>
            </SettingRow>
            <SettingRow label="Default Quote Currency" description="Default pairing for markets">
              <select defaultValue="USDT" style={{ ...ctl, width: 160 }}>
                <option value="USDT">USDT</option>
                <option value="USDC">USDC</option>
                <option value="USD">USD</option>
              </select>
            </SettingRow>
            <SettingRow label="Auto-refresh Interval" description="How often to refresh market data">
              <select defaultValue="1000" style={{ ...ctl, width: 160 }}>
                <option value="500">500ms</option>
                <option value="1000">1s</option>
                <option value="5000">5s</option>
                <option value="10000">10s</option>
              </select>
            </SettingRow>
          </div>
        )

      case 'wallets':
        return <WalletsSettings />

      case 'exchanges':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 500, fontSize: 13 }}>Exchange &amp; Data Source Keys</span>
              <button
                style={miniBtn}
                onClick={() => useWindowStore.getState().openWindow('data-sources', 'Data Sources', '📡')}
              >
                Open Data Sources
              </button>
            </div>
            <div style={{ border: '1px inset', borderColor: '#808080 #fff #fff #808080', background: '#fff', padding: 8, fontSize: 11, lineHeight: 1.6 }}>
              API keys are stored locally in the main process and never leave this machine.
              Configure each source (Robinhood, Yahoo, Binance, Arc…) from the <b>Data Sources</b>{' '}
              window on the desktop. Binance stock data requires a user API key; others work
              with public endpoints today.
            </div>
          </div>
        )
      case 'risk':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
            <SettingRow label="Max Order Value" description="Maximum value per single order (USD)">
              <input type="number" defaultValue="1000" style={{ ...ctl, width: 160, textAlign: 'right' }} />
            </SettingRow>
            <SettingRow label="Max Daily Volume" description="Maximum total trading volume per day (USD)">
              <input type="number" defaultValue="5000" style={{ ...ctl, width: 160, textAlign: 'right' }} />
            </SettingRow>
            <SettingRow label="Max Drawdown" description="Stop trading if drawdown exceeds this">
              <input type="number" defaultValue="20" style={{ ...ctl, width: 160, textAlign: 'right' }} />
              <span style={{ color: 'var(--color-text-muted)' }}>%</span>
            </SettingRow>
            <SettingRow label="Require Human Approval" description="All trades must be approved by user">
              <input type="checkbox" defaultChecked style={{ width: 18, height: 18 }} />
            </SettingRow>
          </div>
        )

      case 'models':
        return <LlmSettings />
    }
  }

  return (
    <div style={{ padding: 10, background: '#fff', minHeight: '100%', boxSizing: 'border-box' }}>
      {/* Title bar */}
      <div
        style={{
          border: '2px outset',
          borderColor: '#fff #808080 #808080 #fff',
          background: '#c0c0c0',
          padding: '6px 10px',
          marginBottom: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <span style={{ fontSize: 18 }}>⚙️</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>Settings</div>
          <div style={{ fontSize: 10 }}>Configure trading preferences and connected accounts</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        {/* Side tabs - Windows list style */}
        <div
          style={{
            width: 178,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            border: '2px outset',
            borderColor: '#fff #808080 #808080 #fff',
            background: '#c0c0c0',
            padding: 4,
          }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 8px',
                background: activeTab === tab.id ? '#000080' : 'transparent',
                color: activeTab === tab.id ? '#fff' : '#000',
                border: activeTab === tab.id ? '1px solid #000080' : 'none',
                fontSize: 12,
                textAlign: 'left',
                cursor: 'pointer',
                fontWeight: activeTab === tab.id ? 700 : 400,
              }}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Content panel */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            border: '2px inset',
            borderColor: '#808080 #fff #fff #808080',
            background: '#c0c0c0',
            padding: 8,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: '#000' }}>
            {tabs.find((t) => t.id === activeTab)?.label}
          </div>
          {renderContent()}
        </div>
      </div>
    </div>
  )
}

/** Shared Windows-95 style for form controls. */
const ctl: React.CSSProperties = {
  padding: '3px 6px',
  fontSize: 11,
  border: '2px inset',
  borderColor: '#808080 #fff #fff #808080',
  background: '#fff',
  color: '#000',
  fontFamily: 'inherit',
}

const SettingRow: React.FC<{
  label: string
  description?: string
  children: React.ReactNode
}> = ({ label, description, children }) => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
      padding: '5px 0',
      borderBottom: '1px solid #808080',
    }}
  >
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12 }}>{label}</div>
      {description && (
        <div style={{ fontSize: 10, color: '#555' }}>{description}</div>
      )}
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
      {children}
    </div>
  </div>
)

/**
 * LLM configuration for agents.
 *
 * Any OpenAI-compatible provider works (OpenAI, DeepSeek, local vLLM /
 * Ollama / LM Studio). The config is persisted by the main process to
 * userData/agent-config.json (0600) and applied to the AgentManager.
 */
const LlmSettings: React.FC = () => {
  const { setLlmConfig, getLlmConfig, mode } = useAgentStore()
  const [provider, setProvider] = useState<'openai' | 'ollama'>('openai')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [ollamaModels, setOllamaModels] = useState<string[]>([])
  const [ollamaError, setOllamaError] = useState('')
  const [detecting, setDetecting] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    void (async () => {
      const cfg = await getLlmConfig()
      if (cfg) {
        setBaseUrl(cfg.baseUrl)
        setApiKey(cfg.apiKey)
        setModel(cfg.model)
        if (cfg.baseUrl.includes('11434')) setProvider('ollama')
      }
      setLoaded(true)
    })()
  }, [getLlmConfig])

  const onSave = async () => {
    setSaving(true)
    setMessage('')
    try {
      const result = await setLlmConfig({ baseUrl: baseUrl.trim(), apiKey: apiKey.trim(), model: model.trim() })
      setMessage(
        result.mode === 'llm'
          ? 'Saved. Agents now run in LLM mode.'
          : 'Config missing fields - agents stay in rule mode.',
      )
    } catch (e) {
      setMessage(`Failed: ${(e as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  const onClear = async () => {
    setSaving(true)
    setMessage('')
    try {
      await setLlmConfig(null)
      setBaseUrl('')
      setApiKey('')
      setModel('')
      setProvider('openai')
      setOllamaModels([])
      setTestResult(null)
      setMessage('Cleared. Agents run in deterministic rule mode.')
    } catch (e) {
      setMessage(`Failed: ${(e as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  const pickOllama = () => {
    setProvider('ollama')
    setBaseUrl('http://127.0.0.1:11434/v1')
    setApiKey('')
    setTestResult(null)
    setOllamaError('')
  }

  const detectOllama = async () => {
    setDetecting(true)
    setOllamaError('')
    try {
      const res = await window.vibeAPI.agent.probeOllama()
      if (!res.ok) {
        setOllamaError(res.error ?? 'Ollama not reachable - is it running on 127.0.0.1:11434?')
        setOllamaModels([])
      } else {
        setOllamaModels(res.models)
        if (res.models.length > 0 && !res.models.includes(model)) {
          setModel(res.models[0]!)
        }
      }
    } catch (e) {
      setOllamaError((e as Error).message)
    } finally {
      setDetecting(false)
    }
  }

  const testConnection = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await window.vibeAPI.agent.testConnection({
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim(),
        model: model.trim(),
      })
      setTestResult(
        res.ok
          ? { ok: true, text: `Connected ✓ model replied: ${res.reply ?? ''}` }
          : { ok: false, text: `Failed: ${res.error ?? 'unknown error'}` },
      )
    } catch (e) {
      setTestResult({ ok: false, text: `Failed: ${(e as Error).message}` })
    } finally {
      setTesting(false)
    }
  }

  if (!loaded) {
    return <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
  }

  const input: React.CSSProperties = {
    width: 320,
    fontFamily: 'monospace',
    padding: '3px 6px',
    fontSize: 11,
    border: '2px inset',
    borderColor: '#808080 #fff #fff #808080',
    background: '#fff',
    color: '#000',
    caretColor: '#000',
  }
  const miniBtn: React.CSSProperties = {
    padding: '3px 10px',
    fontSize: 11,
    background: '#c0c0c0',
    border: '2px outset',
    borderColor: '#fff #808080 #808080 #fff',
    cursor: 'pointer',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 560 }}>
      <div
        style={{
          border: '2px outset',
          borderColor: '#fff #808080 #808080 #fff',
          background: '#c0c0c0',
          padding: '4px 8px',
          fontSize: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span>{mode === 'llm' ? '⚡ LLM mode active' : '⏸ Rule mode (no LLM key)'}</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: '#333' }}>
          Any OpenAI-compatible endpoint · Ollama local supported
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 700, width: 90 }}>Provider</span>
        <button
          style={{ ...miniBtn, fontWeight: provider === 'openai' ? 700 : 400 }}
          onClick={() => { setProvider('openai'); setTestResult(null) }}
        >
          OpenAI-compatible
        </button>
        <button
          style={{ ...miniBtn, fontWeight: provider === 'ollama' ? 700 : 400 }}
          onClick={pickOllama}
        >
          Ollama (local)
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 700, width: 90 }}>Base URL</span>
        <input
          type="text"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://api.openai.com/v1"
          style={input}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 700, width: 90 }}>API Key</span>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={provider === 'ollama' ? 'not needed for local Ollama' : 'sk-...'}
          style={input}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 700, width: 90 }}>Model</span>
        <input
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="gpt-4o-mini / deepseek-chat / llama3.2"
          style={input}
        />
        {provider === 'ollama' && (
          <button style={miniBtn} onClick={() => void detectOllama()} disabled={detecting}>
            {detecting ? 'Detecting…' : 'Detect local models'}
          </button>
        )}
      </div>

      {provider === 'ollama' && ollamaModels.length > 0 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 700, width: 90 }}>Pick model</span>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            style={{ ...input, width: 320 }}
          >
            {ollamaModels.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      )}
      {ollamaError && <div style={{ fontSize: 10, color: '#a00' }}>{ollamaError}</div>}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 700, width: 90 }}>Verify</span>
        <button style={miniBtn} onClick={() => void testConnection()} disabled={testing}>
          {testing ? 'Testing…' : 'Test connection'}
        </button>
        {testResult && (
          <span style={{ fontSize: 10, color: testResult.ok ? '#008000' : '#a00' }}>
            {testResult.text}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button
          onClick={() => void onSave()}
          disabled={saving}
          style={{ ...miniBtn, fontWeight: 700, padding: '4px 16px' }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={() => void onClear()} disabled={saving} style={{ ...miniBtn, color: '#a00' }}>
          Clear
        </button>
        {message && <span style={{ fontSize: 10, color: '#333', alignSelf: 'center' }}>{message}</span>}
      </div>
    </div>
  )
}


const miniBtn: React.CSSProperties = {
  padding: '3px 10px',
  fontSize: 11,
  background: '#c0c0c0',
  border: '2px outset',
  borderColor: '#fff #808080 #808080 #fff',
  cursor: 'pointer',
}

/** Real wallet list from the local vault (Settings -> Wallets tab). */
const WalletsSettings: React.FC = () => {
  const { unlocked, wallets, refresh } = useWalletStore()
  useEffect(() => {
    void refresh()
  }, [refresh])

  const openManager = () => useWindowStore.getState().openWindow('wallets', 'Wallet Manager', '👛')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 500, fontSize: 13 }}>Local Vault Wallets</span>
        <button style={miniBtn} onClick={openManager}>
          Open Wallet Manager
        </button>
      </div>
      {!unlocked ? (
        <div style={infoBox}>
          The vault is <b>locked</b>. Open the Wallet Manager on the desktop to unlock it and to
          create or import wallets (mnemonic or private key).
        </div>
      ) : wallets.length === 0 ? (
        <div style={infoBox}>No wallets yet. Open the Wallet Manager to create your first one.</div>
      ) : (
        wallets.map((w) => (
          <div
            key={w.id}
            style={{
              border: '1px inset',
              borderColor: '#808080 #fff #fff #808080',
              background: '#fff',
              padding: '6px 8px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontWeight: 500, fontSize: 12 }}>{w.name}</div>
              <div style={{ fontSize: 10, color: '#666' }}>
                {w.chain} · {w.address.slice(0, 6)}…{w.address.slice(-4)} ·{' '}
                {w.kind === 'hd' ? 'HD' : 'Private Key'}
                {w.accounts && w.accounts.length > 1 ? ` (${w.accounts.length} accounts)` : ''}
              </div>
            </div>
            <span style={{ fontSize: 10, border: '1px inset', borderColor: '#808080 #fff #fff #808080', padding: '1px 6px' }}>
              Local ✓
            </span>
          </div>
        ))
      )}
    </div>
  )
}

const infoBox: React.CSSProperties = {
  border: '1px inset',
  borderColor: '#808080 #fff #fff #808080',
  background: '#fff',
  padding: 8,
  fontSize: 11,
  lineHeight: 1.6,
}


export default Settings
