/**
 * Settings view - configure wallets, API keys, and application settings.
 */

import React, { useCallback, useEffect, useState } from 'react'
import { useAgentStore, type ProviderApi, type ProviderView } from '../stores/agentStore'
import { useWalletStore } from '../stores/walletStore'
import { useWindowStore } from '../components/95/windowStore'
import { useUiStore, SCALE_LABEL, type UiScale } from '../stores/uiStore'

type SettingsTab = 'general' | 'wallets' | 'models'

/** Blockchain network switcher (Arc testnet / mainnet placeholders). */
const NetworkSetting: React.FC = () => {
  const [network, setNetwork] = useState<'testnet' | 'mainnet'>('testnet')
  const [mainnetReady, setMainnetReady] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    window.vibeAPI.arc
      .getNetwork()
      .then((r) => {
        setNetwork(r.network)
        setMainnetReady(r.mainnetReady)
      })
      .catch(() => {
        // Network API unavailable - keep defaults.
      })
  }, [])

  const onChange = async (v: string) => {
    setErr('')
    try {
      const r = await window.vibeAPI.arc.setNetwork(v)
      setNetwork(r.network)
      setMainnetReady(r.mainnetReady)
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  return (
    <SettingRow
      label="Blockchain Network"
      description="Arc network for quotes & swaps. Mainnet is configured after 9-30 (placeholders until then)."
    >
      <select value={network} onChange={(e) => void onChange(e.target.value)} style={{ ...ctl, width: 160 }}>
        <option value="testnet">Arc Testnet (5042002)</option>
        <option value="mainnet">Arc Mainnet {mainnetReady ? '' : '(pending config)'}</option>
      </select>
      {err && <span style={{ color: '#a00', fontSize: 11 }}>{err}</span>}
    </SettingRow>
  )
}

const Settings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
  const uiScale = useUiStore((s) => s.scale)
  const setUiScale = useUiStore((s) => s.setScale)

  const tabs: { id: SettingsTab; label: string; icon: string }[] = [
    { id: 'general', label: 'General', icon: '⚙️' },
    { id: 'wallets', label: 'Wallets', icon: '🔐' },
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
            <SettingRow label="Interface Size" description="Zoom the whole interface - titles, chat, icons and spacing">
              <select
                value={uiScale}
                onChange={(e) => setUiScale(e.target.value as UiScale)}
                style={{ ...ctl, width: 160 }}
              >
                <option value="small">Small (90%)</option>
                <option value="normal">Normal (100%)</option>
                <option value="large">Large (125%)</option>
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
            <NetworkSetting />
          </div>
        )

      case 'wallets':
        return <WalletsSettings />

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
  const { listProviders, saveProvider, activateProvider, removeProvider, getLlmConfig } = useAgentStore()
  const api = window.vibeAPI.agent
  const [providers, setProviders] = useState<ProviderView[]>([])
  const [loaded, setLoaded] = useState(false)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<ProviderView | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null)

  // New/edit form fields.
  const [fName, setFName] = useState('OpenAI')
  const [fApi, setFApi] = useState<ProviderApi>('openai-completions')
  const [fBaseUrl, setFBaseUrl] = useState('https://api.openai.com/v1')
  const [fApiKey, setFApiKey] = useState('')
  const [fModels, setFModels] = useState('gpt-4o')
  const [fModel, setFModel] = useState('gpt-4o')
  const [fActive, setFActive] = useState(false)

  const load = useCallback(async () => {
    const list = await listProviders()
    setProviders(list)
    setLoaded(true)
  }, [listProviders])

  useEffect(() => {
    void load()
  }, [load])

  /** Presets so international providers configure in one click. */
  const PRESETS: { name: string; api: ProviderApi; baseUrl: string; models: string }[] = [
    { name: 'OpenAI', api: 'openai-completions', baseUrl: 'https://api.openai.com/v1', models: 'gpt-4o, gpt-4o-mini' },
    { name: 'Anthropic', api: 'anthropic-messages', baseUrl: 'https://api.anthropic.com', models: 'claude-sonnet-4-20250514, claude-opus-4-20250514' },
    { name: 'Gemini', api: 'google-generative-ai', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', models: 'gemini-2.0-flash, gemini-2.5-pro' },
    { name: 'DeepSeek', api: 'openai-completions', baseUrl: 'https://api.deepseek.com/v1', models: 'deepseek-chat, deepseek-reasoner' },
    { name: 'Volcengine Ark', api: 'openai-completions', baseUrl: 'https://ark.cn-beijing.volces.com/api/plan/v3', models: 'ark-code-latest, deepseek-v3.1' },
    { name: 'Ollama (local)', api: 'openai-completions', baseUrl: 'http://localhost:11434/v1', models: 'llama3.1, qwen2.5' },
    { name: 'Custom', api: 'openai-completions', baseUrl: '', models: '' },
  ]

  const applyPreset = (name: string) => {
    const p = PRESETS.find((x) => x.name === name) ?? PRESETS[PRESETS.length - 1]!
    setFName(p.name)
    setFApi(p.api)
    setFBaseUrl(p.baseUrl)
    setFModels(p.models)
    setFModel(p.models.split(',')[0]?.trim() ?? '')
  }

  const openNew = () => {
    setEditing(null)
    setShowForm(true)
    setFApiKey('')
    applyPreset('OpenAI')
    setFActive(providers.length === 0)
    setMessage('')
    setTestResult(null)
  }

  const openEdit = (p: ProviderView) => {
    setEditing(p)
    setShowForm(true)
    setFName(p.name)
    setFApi(p.api)
    setFBaseUrl(p.baseUrl)
    setFApiKey('')
    setFModels(p.models.join(', '))
    setFModel(p.model)
    setFActive(p.active)
    setMessage('')
    setTestResult(null)
  }

  const onSave = async () => {
    setSaving(true)
    setMessage('')
    try {
      const saved = await saveProvider({
        id: editing?.id,
        name: fName,
        api: fApi,
        baseUrl: fBaseUrl,
        apiKey: fApiKey,
        models: fModels.split(',').map((m) => m.trim()).filter(Boolean),
        model: fModel.trim(),
        active: fActive,
      })
      setShowForm(false)
      setEditing(null)
      setFApiKey('')
      setMessage(
        saved.active
          ? `Saved - this provider is now active. Existing agents pick it up on their next run.`
          : `Saved. Activate it to route agents through it.`,
      )
      await load()
    } catch (e) {
      setMessage(`Failed: ${(e as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  const onActivate = async (id: string) => {
    try {
      await activateProvider(id)
      setMessage('Provider activated.')
      await load()
    } catch (e) {
      setMessage(`Failed: ${(e as Error).message}`)
    }
  }

  const onRemove = async (p: ProviderView) => {
    if (!window.confirm(`Remove provider "${p.name}"?`)) return
    try {
      await removeProvider(p.id)
      setMessage('Provider removed.')
      await load()
    } catch (e) {
      setMessage(`Failed: ${(e as Error).message}`)
    }
  }

  const onTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const cfg = await getLlmConfig()
      if (!cfg) {
        setTestResult({ ok: false, text: 'No active provider configured.' })
        return
      }
      const r = await api.testConnection(cfg)
      setTestResult({ ok: r.ok, text: r.ok ? (r.reply ?? 'Connected') : (r.error ?? 'Failed') })
    } catch (e) {
      setTestResult({ ok: false, text: (e as Error).message })
    } finally {
      setTesting(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    fontSize: 11,
    fontFamily: 'inherit',
    background: '#fff',
    color: '#000',
    border: '2px inset',
    borderColor: '#808080 #fff #fff #808080',
    padding: '3px 5px',
  }
  /** Field layout: label above, control below, full column width. */
  const field = (labelText: string, control: React.ReactNode) => (
    <div>
      <div style={{ fontSize: 11, color: '#000', marginBottom: 2 }}>{labelText}</div>
      {control}
    </div>
  )
  const btn: React.CSSProperties = {
    fontSize: 11,
    background: '#c0c0c0',
    border: '2px outset',
    borderColor: '#fff #808080 #808080 #fff',
    padding: '3px 10px',
    cursor: 'pointer',
    color: '#000',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 11, lineHeight: 1.6 }}>
        Keep several providers (OpenAI, Anthropic, Gemini, DeepSeek, Ollama…) with their own keys.
        Only <b>one is active</b> at a time - agents use the active provider, and each agent can
        pick its own model. Keys stay in the main process and are never shown here again.
      </div>

      {providers.map((p) => (
        <div
          key={p.id}
          style={{
            border: '2px outset',
            borderColor: '#fff #808080 #808080 #fff',
            background: p.active ? '#ffffe0' : '#c0c0c0',
            padding: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <input
            type="radio"
            checked={p.active}
            onChange={() => void onActivate(p.id)}
            title="Set as active provider"
            style={{ width: 14, height: 14, cursor: 'pointer' }}
          />
          <span style={{ fontWeight: 'bold', fontSize: 12, color: '#000' }}>{p.name}</span>
          {p.active && <span style={{ fontSize: 10, color: '#000080', fontWeight: 'bold' }}>ACTIVE</span>}
          <span style={{ fontSize: 10, color: '#333', fontFamily: 'monospace' }}>{p.api}</span>
          <span style={{ fontSize: 10, color: '#333', fontFamily: 'monospace', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {p.baseUrl}
          </span>
          <span style={{ fontSize: 10, color: '#333' }}>
            {p.hasKey ? 'key saved' : 'no key'} · default <b>{p.model}</b>
          </span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            <button style={btn} onClick={() => openEdit(p)}>Edit</button>
            <button style={btn} onClick={() => void onRemove(p)}>Remove</button>
          </span>
        </div>
      ))}

      {providers.length === 0 && !showForm && (
        <div style={{ fontSize: 11, color: '#333' }}>
          No provider yet - add one (e.g. Gemini, Anthropic, DeepSeek or your local Ollama).
        </div>
      )}

      {showForm && (
        <div style={{ border: '2px inset', borderColor: '#808080 #fff #fff #808080', background: '#fff', padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 'bold', color: '#000' }}>
            {editing ? `Edit provider - ${editing.name}` : 'Add provider'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 14px', alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {!editing &&
                field(
                  'Preset',
                  <select value={fName} onChange={(e) => applyPreset(e.target.value)} style={inputStyle}>
                    {PRESETS.map((p) => (
                      <option key={p.name} value={p.name}>{p.name}</option>
                    ))}
                  </select>,
                )}
              {field(
                'Name',
                <input value={fName} onChange={(e) => setFName(e.target.value)} style={inputStyle} />,
              )}
              {field(
                'API',
                <select value={fApi} onChange={(e) => setFApi(e.target.value as ProviderApi)} style={inputStyle}>
                  <option value="openai-completions">OpenAI-compatible (also Ollama)</option>
                  <option value="anthropic-messages">Anthropic Messages</option>
                  <option value="google-generative-ai">Google Gemini</option>
                </select>,
              )}
              {field(
                'Base URL',
                <input
                  value={fBaseUrl}
                  onChange={(e) => setFBaseUrl(e.target.value)}
                  placeholder="https://…"
                  style={inputStyle}
                />,
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {field(
                'API key',
                <input
                  type="password"
                  value={fApiKey}
                  onChange={(e) => setFApiKey(e.target.value)}
                  placeholder={editing ? 'Leave empty to keep the saved key' : 'sk-…'}
                  style={inputStyle}
                />,
              )}
              {field(
                'Models',
                <input
                  value={fModels}
                  onChange={(e) => setFModels(e.target.value)}
                  placeholder="comma separated, e.g. gpt-4o, gpt-4o-mini"
                  style={inputStyle}
                />,
              )}
              {field(
                'Default model',
                <input
                  value={fModel}
                  onChange={(e) => setFModel(e.target.value)}
                  placeholder="default for this provider"
                  style={inputStyle}
                />,
              )}
              <div>
                <div style={{ fontSize: 11, color: '#000', marginBottom: 2 }}>Activate</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#333', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={fActive}
                    onChange={(e) => setFActive(e.target.checked)}
                    style={{ width: 15, height: 15 }}
                  />
                  Route agents through this provider now
                </label>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
            <button style={btn} disabled={saving} onClick={() => void onSave()}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button style={btn} onClick={() => { setShowForm(false); setEditing(null); setMessage(''); }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
        {!showForm && (
          <button style={btn} onClick={openNew}>Add provider</button>
        )}
        <button style={btn} disabled={testing || providers.length === 0} onClick={() => void onTest()}>
          {testing ? 'Testing…' : 'Test active provider'}
        </button>
        {message && <span style={{ fontSize: 10, color: '#333' }}>{message}</span>}
        {testResult && (
          <span style={{ fontSize: 10, color: testResult.ok ? '#006600' : '#990000' }}>{testResult.text}</span>
        )}
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
