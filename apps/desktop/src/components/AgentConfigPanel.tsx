/**
 * AgentConfigPanel - per-agent authorization UI shared by the Agents
 * manager and the chat window's Settings tab.
 *
 * Lets the user pick which registered data sources and granted wallet
 * accounts this agent may access, and shows the currently selected AI
 * model (configured in Settings -> AI Models).
 */

import React, { useEffect, useState } from 'react'
import { useAgentStore } from '../stores/agentStore'
import { useWalletStore } from '../stores/walletStore'

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
  const { dataSources, setDataSourceAuth, setWalletAuth, getLlmConfig } = useAgentStore()
  const authorizedWallets = useWalletStore((s) => s.authorized)
  const walletMetas = useWalletStore((s) => s.wallets)

  const [dsSel, setDsSel] = useState<string[]>(initialDataSources)
  const [waSel, setWaSel] = useState<string[]>(initialWalletAuths)
  const [authSaved, setAuthSaved] = useState(false)
  const [modelInfo, setModelInfo] = useState<string>('')

  // Reflect the currently selected AI model (Settings -> AI Models).
  useEffect(() => {
    void getLlmConfig().then((cfg) => {
      if (cfg?.model) {
        setModelInfo(`${cfg.model} · ${new URL(cfg.baseUrl).host}`)
      } else {
        setModelInfo('No LLM configured - add a key in Settings')
      }
    })
  }, [getLlmConfig])

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
      <div style={{ fontSize: 11, color: '#000', marginBottom: 4 }}>{modelInfo}</div>

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
