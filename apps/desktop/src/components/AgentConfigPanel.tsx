/**
 * AgentConfigPanel - per-agent authorization UI shared by the Agents
 * manager and the chat window's Settings tab.
 *
 * Lets the user pick which registered data sources and granted wallet
 * accounts this agent may access, and shows the currently selected AI
 * model (configured in Settings -> AI Models).
 */

import React, { useEffect, useState } from 'react'
import { useAgentStore, type ProviderView } from '../stores/agentStore'
import { useWalletStore } from '../stores/walletStore'

/** Quick-pick list for the model field. Providers are OpenAI-compatible,
 *  so the same base URL + key often serves several models; the user can
 *  also type any model id manually. */
const COMMON_MODELS = [
  'ark-code-latest',
  'deepseek-chat',
  'deepseek-reasoner',
  'gpt-4o',
  'gpt-4o-mini',
  'claude-sonnet-4-20250514',
  'qwen-plus',
  'llama3.1',
]


const btnPrimary: React.CSSProperties = {
  padding: '3px 10px',
  fontSize: 11,
  background: '#c0c0c0',
  border: '2px outset',
  borderColor: '#fff #808080 #808080 #fff',
  cursor: 'pointer',
  fontFamily: 'inherit',
  color: '#000',
}

const AgentConfigPanel: React.FC<{
  agentId: string
  initialDataSources: string[]
  initialWalletAuths: string[]
  onSaved?: () => void
}> = ({ agentId, initialDataSources, initialWalletAuths, onSaved }) => {
  const { agents, dataSources, setDataSourceAuth, setWalletAuth, listProviders, getLlmConfig, setAgentModel } = useAgentStore()
  const authorizedWallets = useWalletStore((s) => s.authorized)
  const walletMetas = useWalletStore((s) => s.wallets)

  const [dsSel, setDsSel] = useState<string[]>(initialDataSources)
  const [waSel, setWaSel] = useState<string[]>(initialWalletAuths)
  const [authSaved, setAuthSaved] = useState(false)
  const [providers, setProviders] = useState<ProviderView[]>([])
  const [modelInfo, setModelInfo] = useState<string>('')
  const [modelInput, setModelInput] = useState<string>('')
  const [modelSaved, setModelSaved] = useState(false)

  // Reflect the effective model for this agent: its own override, else the
  // active provider's default (Settings -> AI Models).
  useEffect(() => {
    void (async () => {
      const [prov, cfg] = await Promise.all([listProviders(), getLlmConfig()])
      setProviders(prov)
      const active = prov.find((p) => p.active) ?? null
      const agentModel = agents.find((a) => a.id === agentId)?.model ?? null
      const effective = agentModel ?? cfg?.model ?? null
      if (effective) {
        setModelInfo(
          `${effective}${agentModel ? ' (this agent)' : ' (provider default)'} · ${
            active ? active.name : 'active provider'
          }`,
        )
        setModelInput(effective)
      } else {
        setModelInfo('No LLM configured - add a provider in Settings')
      }
    })()
  }, [listProviders, getLlmConfig, agents, agentId])

  const activeProvider = providers.find((p) => p.active) ?? null
  const modelOptions =
    activeProvider && activeProvider.models.length > 0
      ? activeProvider.models
      : COMMON_MODELS

  return (
    <div
      style={{
        border: '2px inset',
        borderColor: '#808080 #fff #fff #808080',
        background: '#c0c0c0',
        padding: 6,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 'bold', color: '#000', marginBottom: 4 }}>
        AI model
      </div>
      <div style={{ fontSize: 10, color: '#666', marginBottom: 4 }}>{modelInfo}</div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        <select
          value={modelOptions.includes(modelInput) ? modelInput : ''}
          onChange={(e) => {
            if (e.target.value) setModelInput(e.target.value)
          }}
          style={{
            flex: 1,
            fontSize: 11,
            background: '#fff',
            border: '2px inset',
            borderColor: '#808080 #fff #fff #808080',
            color: '#000',
          }}
        >
          <option value="">Provider models…</option>
          {modelOptions.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <input
          value={modelInput}
          onChange={(e) => setModelInput(e.target.value)}
          placeholder="or type a model id"
          style={{
            flex: 2,
            fontSize: 11,
            background: '#fff',
            border: '2px inset',
            borderColor: '#808080 #fff #fff #808080',
            color: '#000',
            padding: '2px 4px',
          }}
        />
        <button
          style={{
            padding: '2px 8px',
            fontSize: 11,
            background: '#c0c0c0',
            border: '2px outset',
            borderColor: '#fff #808080 #808080 #fff',
            cursor: 'pointer',
            color: '#000',
          }}
          onClick={async () => {
            const m = modelInput.trim()
            setModelSaved(false)
            try {
              await setAgentModel({ id: agentId, model: m })
              setModelInfo(m ? `${m} · saved for this agent` : 'Provider default · saved')
              setModelSaved(true)
            } catch (err) {
              setModelInfo(err instanceof Error ? err.message : String(err))
            }
          }}
        >
          Apply
        </button>
      </div>
      {modelSaved && (
        <div style={{ fontSize: 10, color: '#006600', marginBottom: 4 }}>
          Model updated for this agent - next messages use it. Leave the field empty and Apply to
          fall back to the provider default.
        </div>
      )}

      <div style={{ fontSize: 11, fontWeight: 'bold', color: '#000', marginBottom: 4 }}>
        Authorized data sources
      </div>
      {dataSources.length === 0 && (
        <div style={{ fontSize: 10, color: '#666', marginBottom: 4 }}>No sources registered.</div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px' }}>
        {dataSources.map((ds) => (
          <label key={ds} style={{ fontSize: 11, color: '#000', display: 'flex', gap: 4, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={dsSel.includes(ds)}
              onChange={(e) => {
                setDsSel((prev) =>
                  e.target.checked ? [...prev, ds] : prev.filter((x) => x !== ds),
                )
              }}
            />
            {ds}
          </label>
        ))}
      </div>
      <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>
        Empty selection = all registered sources.
      </div>

      <div style={{ fontSize: 11, fontWeight: 'bold', color: '#000', margin: '8px 0 4px' }}>
        Authorized wallets (granted in Wallet Manager)
      </div>
      {authorizedWallets.length === 0 && (
        <div style={{ fontSize: 10, color: '#666', marginBottom: 4 }}>
          No wallet accounts granted yet. Unlock the vault and grant an agent in Wallet Manager.
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px' }}>
        {walletMetas
          .flatMap((w) => {
            if (w.kind === 'hd' && w.accounts && w.accounts.length > 0) {
              return w.accounts.map((a) => ({
                key: `${w.id}:${a.index}`,
                label: `${w.name} #${a.index}`,
                address: a.address,
              }))
            }
            return [{ key: w.id, label: w.name, address: w.address }]
          })
          .filter((o) => authorizedWallets.includes(o.key))
          .map((o) => (
            <label
              key={o.key}
              style={{
                fontSize: 11,
                color: '#000',
                display: 'flex',
                gap: 4,
                alignItems: 'center',
              }}
              title={o.address}
            >
              <input
                type="checkbox"
                checked={waSel.includes(o.key)}
                onChange={(e) => {
                  setWaSel((prev) =>
                    e.target.checked ? [...prev, o.key] : prev.filter((x) => x !== o.key),
                  )
                }}
              />
              {o.label}
            </label>
          ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
        <button
          style={btnPrimary}
          onClick={async () => {
            await setDataSourceAuth(agentId, dsSel)
            await setWalletAuth(agentId, waSel)
            setAuthSaved(true)
            setTimeout(() => setAuthSaved(false), 1500)
            onSaved?.()
          }}
        >
          Save auth
        </button>
        {authSaved && <span style={{ fontSize: 10, color: '#060' }}>Saved.</span>}
      </div>
    </div>
  )
}

export default AgentConfigPanel
