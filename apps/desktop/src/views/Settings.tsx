/**
 * Settings view - configure wallets, API keys, and application settings.
 */

import React, { useEffect, useState } from 'react'
import { useAgentStore } from '../stores/agentStore'

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
              <select defaultValue="system" style={{ width: 160 }}>
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </SettingRow>
            <SettingRow label="Language" description="Display language">
              <select defaultValue="en" style={{ width: 160 }}>
                <option value="en">English</option>
                <option value="zh">中文</option>
              </select>
            </SettingRow>
            <SettingRow label="Default Quote Currency" description="Default pairing for markets">
              <select defaultValue="USDT" style={{ width: 160 }}>
                <option value="USDT">USDT</option>
                <option value="USDC">USDC</option>
                <option value="USD">USD</option>
              </select>
            </SettingRow>
            <SettingRow label="Auto-refresh Interval" description="How often to refresh market data">
              <select defaultValue="1000" style={{ width: 160 }}>
                <option value="500">500ms</option>
                <option value="1000">1s</option>
                <option value="5000">5s</option>
                <option value="10000">10s</option>
              </select>
            </SettingRow>
          </div>
        )

      case 'wallets':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 500 }}>Connected Wallets</span>
              <button
                style={{
                  padding: 'var(--space-xs) var(--space-md)',
                  backgroundColor: 'var(--color-accent)',
                  color: 'white',
                  borderRadius: 'var(--radius-md)',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 'var(--font-sm)',
                }}
              >
                + Add Wallet
              </button>
            </div>
            {[
              { name: 'Main Wallet', chain: 'Ethereum', address: '0x1234...5678', type: 'MetaMask' },
              { name: 'Solana Wallet', chain: 'Solana', address: '7xKX...9mPq', type: 'Phantom' },
            ].map((wallet) => (
              <div
                key={wallet.name}
                style={{
                  padding: 'var(--space-md)',
                  backgroundColor: 'var(--color-bg-secondary)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontWeight: 500 }}>{wallet.name}</div>
                  <div style={{ fontSize: 'var(--font-sm)', color: 'var(--color-text-muted)' }}>
                    {wallet.chain} · {wallet.type} · {wallet.address}
                  </div>
                </div>
                <span style={{ fontSize: 'var(--font-sm)', color: 'var(--color-success)' }}>
                  Connected
                </span>
              </div>
            ))}
          </div>
        )

      case 'exchanges':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 500 }}>Exchange API Keys</span>
              <button
                style={{
                  padding: 'var(--space-xs) var(--space-md)',
                  backgroundColor: 'var(--color-accent)',
                  color: 'white',
                  borderRadius: 'var(--radius-md)',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 'var(--font-sm)',
                }}
              >
                + Add Exchange
              </button>
            </div>
            {[
              { name: 'Binance', status: 'connected', readOnly: false },
              { name: 'OKX', status: 'not_configured', readOnly: false },
              { name: 'Coinbase', status: 'not_configured', readOnly: false },
            ].map((ex) => (
              <div
                key={ex.name}
                style={{
                  padding: 'var(--space-md)',
                  backgroundColor: 'var(--color-bg-secondary)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontWeight: 500 }}>{ex.name}</div>
                  <div style={{ fontSize: 'var(--font-sm)', color: 'var(--color-text-muted)' }}>
                    Spot & Margin trading
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 'var(--font-sm)',
                    color: ex.status === 'connected' ? 'var(--color-success)' : 'var(--color-text-muted)',
                  }}
                >
                  {ex.status === 'connected' ? 'Connected' : 'Not configured'}
                </span>
              </div>
            ))}
          </div>
        )

      case 'risk':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
            <SettingRow label="Max Order Value" description="Maximum value per single order (USD)">
              <input type="number" defaultValue="1000" style={{ width: 160, textAlign: 'right' }} />
            </SettingRow>
            <SettingRow label="Max Daily Volume" description="Maximum total trading volume per day (USD)">
              <input type="number" defaultValue="5000" style={{ width: 160, textAlign: 'right' }} />
            </SettingRow>
            <SettingRow label="Max Drawdown" description="Stop trading if drawdown exceeds this">
              <input type="number" defaultValue="20" style={{ width: 160, textAlign: 'right' }} />
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
    <div style={{ padding: 'var(--space-xl)' }}>
      <div style={{ marginBottom: 'var(--space-xl)' }}>
        <h1 style={{ fontSize: 'var(--font-2xl)', margin: 0, marginBottom: 'var(--space-xs)' }}>
          Settings
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
          Configure your trading preferences and connected accounts.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-xl)' }}>
        {/* Side tabs */}
        <div
          style={{
            width: 220,
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-xs)',
          }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-md)',
                padding: 'var(--space-sm) var(--space-md)',
                backgroundColor: activeTab === tab.id ? 'var(--color-bg-secondary)' : 'transparent',
                color: activeTab === tab.id ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                fontSize: 'var(--font-md)',
                textAlign: 'left',
              }}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div
          style={{
            flex: 1,
            backgroundColor: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-xl)',
          }}
        >
          <h2 style={{ margin: 0, marginBottom: 'var(--space-lg)', fontSize: 'var(--font-lg)' }}>
            {tabs.find((t) => t.id === activeTab)?.label}
          </h2>
          {renderContent()}
        </div>
      </div>
    </div>
  )
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
      padding: 'var(--space-md) 0',
      borderBottom: '1px solid var(--color-border-light)',
    }}
  >
    <div>
      <div style={{ fontWeight: 500 }}>{label}</div>
      {description && (
        <div style={{ fontSize: 'var(--font-sm)', color: 'var(--color-text-muted)' }}>
          {description}
        </div>
      )}
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
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
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    void (async () => {
      const cfg = await getLlmConfig()
      if (cfg) {
        setBaseUrl(cfg.baseUrl)
        setApiKey(cfg.apiKey)
        setModel(cfg.model)
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
      setMessage('Cleared. Agents run in deterministic rule mode.')
    } catch (e) {
      setMessage(`Failed: ${(e as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) {
    return <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
      <div
        style={{
          padding: '10px 14px',
          borderRadius: 8,
          background:
            mode === 'llm' ? 'rgba(63,185,80,0.1)' : 'rgba(210,153,34,0.08)',
          border:
            mode === 'llm'
              ? '1px solid rgba(63,185,80,0.3)'
              : '1px solid rgba(210,153,34,0.25)',
          color: mode === 'llm' ? 'var(--color-success)' : 'var(--color-warning)',
          fontSize: 'var(--font-sm)',
        }}
      >
        {mode === 'llm'
          ? 'LLM mode is active - agents analyze with your configured model.'
          : 'Rule mode - agents use deterministic analysis on live multi-source prices. Configure a key to unlock LLM analysis.'}
      </div>

      <SettingRow label="API Base URL" description="OpenAI-compatible endpoint, e.g. https://api.openai.com/v1 or https://api.deepseek.com/v1">
        <input
          type="text"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://api.openai.com/v1"
          style={{ width: 320, fontFamily: 'monospace' }}
        />
      </SettingRow>
      <SettingRow label="API Key" description="Key for the provider (stored locally, never leaves this machine)">
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-..."
          style={{ width: 320, fontFamily: 'monospace' }}
        />
      </SettingRow>
      <SettingRow label="Model" description="Model id, e.g. gpt-4o-mini, deepseek-chat, qwen2.5:7b">
        <input
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="deepseek-chat"
          style={{ width: 320, fontFamily: 'monospace' }}
        />
      </SettingRow>
      <SettingRow label="" description="">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            onClick={() => void onSave()}
            disabled={saving}
            style={{
              padding: '8px 20px',
              backgroundColor: 'var(--color-accent)',
              color: 'white',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              cursor: 'pointer',
              fontSize: 'var(--font-sm)',
              fontWeight: 600,
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={() => void onClear()}
            disabled={saving}
            style={{
              padding: '8px 20px',
              backgroundColor: 'transparent',
              color: 'var(--color-text-secondary)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              cursor: 'pointer',
              fontSize: 'var(--font-sm)',
            }}
          >
            Clear
          </button>
          {message && <span style={{ fontSize: 'var(--font-sm)', color: 'var(--color-text-secondary)' }}>{message}</span>}
        </div>
      </SettingRow>
    </div>
  )
}

export default Settings
