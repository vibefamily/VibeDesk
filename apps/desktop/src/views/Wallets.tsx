/**
 * Wallets view - local-first multi-wallet vault.
 *
 * Security model:
 * - The vault lives in the Electron main process; the renderer only sees
 *   address-level metadata.
 * - Viewing / exporting a private key, mnemonic or keystore always
 *   requires the vault password again (MetaMask-style).
 * - Agent access is granted per wallet in memory only and can be
 *   revoked at any time.
 */

import React, { useCallback, useEffect, useState } from 'react'
import type { WalletMeta } from '../types/wallet'
import { useWalletStore } from '../stores/walletStore'

// --- Small UI primitives ----------------------------------------------------

function shortAddr(address: string): string {
  if (address.length <= 14) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
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
  borderColor: 'rgba(248, 81, 73, 0.4)',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 10px',
  borderRadius: '6px',
  border: '1px solid var(--color-border)',
  background: 'var(--color-bg-tertiary)',
  color: 'var(--color-text-primary)',
  fontSize: 'var(--font-md)',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 'var(--font-sm)',
  color: 'var(--color-text-secondary)',
  marginBottom: 4,
}

const cardStyle: React.CSSProperties = {
  background: 'var(--color-bg-secondary)',
  border: '1px solid var(--color-border)',
  borderRadius: '12px',
  padding: 'var(--space-lg)',
}

const Modal: React.FC<{
  title: string
  onClose: () => void
  children: React.ReactNode
}> = ({ title, onClose, children }) => (
  <div
    style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(1, 4, 9, 0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
    }}
    onClick={onClose}
  >
    <div
      style={{ ...cardStyle, width: 480, maxWidth: '92vw' }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 'var(--space-lg)',
        }}
      >
        <h3 style={{ margin: 0, fontSize: 'var(--font-lg)' }}>{title}</h3>
        <button style={{ ...btnBase, padding: '2px 10px' }} onClick={onClose}>
          ✕
        </button>
      </div>
      {children}
    </div>
  </div>
)

// --- Secret reveal (password-gated) -----------------------------------------

interface SecretResult {
  kind: 'mnemonic' | 'privateKey' | 'keystore'
  value: string
  address?: string
}

/** Password prompt used for viewing/exporting secrets and agent auth. */
const SecretGate: React.FC<{
  title: string
  hint: string
  submitLabel: string
  onSubmit: (password: string) => Promise<unknown>
  onClose: () => void
}> = ({ title, hint, submitLabel, onSubmit, onClose }) => {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await onSubmit(password)
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <p style={{ marginTop: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-sm)' }}>
        {hint}
      </p>
      <input
        type="password"
        placeholder="Vault password"
        style={inputStyle}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && void submit()}
        autoFocus
      />
      {error && (
        <p style={{ color: 'var(--color-danger)', fontSize: 'var(--font-sm)', margin: '8px 0 0' }}>
          {error}
        </p>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 'var(--space-lg)' }}>
        <button style={btnPrimary} onClick={() => void submit()} disabled={busy || !password}>
          {submitLabel}
        </button>
        <button style={btnBase} onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  )
}

/** Shows a revealed secret with a one-time warning. */
const SecretReveal: React.FC<{ result: SecretResult; onClose: () => void }> = ({
  result,
  onClose,
}) => {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    void navigator.clipboard.writeText(result.value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Modal title={result.kind === 'mnemonic' ? 'Recovery phrase' : 'Private key'} onClose={onClose}>
      <div
        style={{
          background: 'var(--color-bg-tertiary)',
          border: '1px solid var(--color-border)',
          borderRadius: 8,
          padding: 'var(--space-lg)',
          fontFamily: 'monospace',
          fontSize: 'var(--font-sm)',
          wordBreak: 'break-all',
          lineHeight: 1.7,
          maxHeight: 220,
          overflow: 'auto',
        }}
      >
        {result.value}
      </div>
      <p style={{ color: 'var(--color-warning)', fontSize: 'var(--font-sm)' }}>
        Anyone with this can control your funds. Store it offline and never screenshot it.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button style={btnPrimary} onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button style={btnBase} onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  )
}

// --- Account row ------------------------------------------------------------

interface AccountRowProps {
  wallet: WalletMeta
  label: string
  address: string
  authKey: string
  index?: number
  onAuthChanged: () => void
}

const AccountRow: React.FC<AccountRowProps> = ({
  wallet,
  label,
  address,
  authKey,
  index,
  onAuthChanged,
}) => {
  const authorized = useWalletStore((s) => s.authorized.includes(authKey))
  const exportPrivateKey = useWalletStore((s) => s.exportPrivateKey)
  const exportKeystore = useWalletStore((s) => s.exportKeystore)
  const authorizeAgent = useWalletStore((s) => s.authorizeAgent)
  const revokeAgent = useWalletStore((s) => s.revokeAgent)

  const [copied, setCopied] = useState(false)
  const [secret, setSecret] = useState<SecretResult | null>(null)
  const [gate, setGate] = useState<'key' | 'keystore' | 'agent' | null>(null)

  const copy = () => {
    void navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const onGateSubmit = async (password: string) => {
    if (gate === 'key') {
      const value = await exportPrivateKey({ walletId: wallet.id, password, index })
      setSecret({ kind: 'privateKey', value })
    } else if (gate === 'keystore') {
      const ks = await exportKeystore({ walletId: wallet.id, password })
      const value = JSON.stringify(ks, null, 2)
      // Trigger a file download of the keystore JSON.
      const blob = new Blob([value], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `UTC--${new Date().toISOString().replace(/[:.]/g, '-')}--${address}.json`
      a.click()
      URL.revokeObjectURL(url)
      setSecret({ kind: 'keystore', value })
    } else if (gate === 'agent') {
      await authorizeAgent({ walletId: wallet.id, password, index })
      onAuthChanged()
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 4px',
        borderTop: '1px solid var(--color-border-light)',
        flexWrap: 'wrap',
      }}
    >
      <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-xs)', width: 28 }}>
        {label}
      </span>
      <code style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-sm)' }}>
        {shortAddr(address)}
      </code>
      <span style={{ flex: 1 }} />
      <button style={btnBase} onClick={copy}>
        {copied ? '✓' : 'Copy'}
      </button>
      <button style={btnBase} onClick={() => setGate('key')}>
        Private key
      </button>
      <button style={btnBase} onClick={() => setGate('keystore')}>
        Keystore
      </button>
      {authorized ? (
        <button
          style={{ ...btnBase, color: 'var(--color-success)', borderColor: 'rgba(63,185,80,0.4)' }}
          onClick={() => {
            void revokeAgent({ walletId: wallet.id, index })
            onAuthChanged()
          }}
        >
          Agent ✓
        </button>
      ) : (
        <button style={btnBase} onClick={() => setGate('agent')}>
          Grant Agent
        </button>
      )}
      {gate && (
        <SecretGate
          title={
            gate === 'agent'
              ? 'Grant Agent access'
              : gate === 'key'
                ? 'Reveal private key'
                : 'Export keystore'
          }
          hint={
            gate === 'agent'
              ? 'The Agent will hold this key in memory only, until you revoke it.'
              : 'Enter the vault password to continue.'
          }
          submitLabel={gate === 'agent' ? 'Grant' : 'Confirm'}
          onSubmit={onGateSubmit}
          onClose={() => setGate(null)}
        />
      )}
      {secret && <SecretReveal result={secret} onClose={() => setSecret(null)} />}
    </div>
  )
}

// --- Wallet cards -----------------------------------------------------------

const HdWalletCard: React.FC<{ wallet: WalletMeta; onAuthChanged: () => void }> = ({
  wallet,
  onAuthChanged,
}) => {
  const deriveMore = useWalletStore((s) => s.deriveMore)
  const exportMnemonic = useWalletStore((s) => s.exportMnemonic)
  const remove = useWalletStore((s) => s.remove)
  const [secret, setSecret] = useState<SecretResult | null>(null)
  const [gate, setGate] = useState<'mnemonic' | 'derive' | 'remove' | null>(null)
  const [busy, setBusy] = useState(false)

  const accounts = wallet.accounts ?? []

  const onGateSubmit = async (password: string) => {
    if (gate === 'mnemonic') {
      const value = await exportMnemonic({ walletId: wallet.id, password })
      setSecret({ kind: 'mnemonic', value })
    } else if (gate === 'derive') {
      await deriveMore({ hdWalletId: wallet.id, count: 1, password })
      onAuthChanged()
    } else if (gate === 'remove') {
      setBusy(true)
      await remove(wallet.id)
      setBusy(false)
      setGate(null)
    }
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 'var(--font-lg)' }}>{wallet.name}</h3>
        <span
          style={{
            fontSize: 'var(--font-xs)',
            padding: '2px 8px',
            borderRadius: 999,
            background: 'rgba(88,166,255,0.15)',
            color: 'var(--color-accent)',
          }}
        >
          HD · {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}
        </span>
        <span style={{ flex: 1 }} />
        <button style={btnBase} onClick={() => setGate('mnemonic')}>
          Recovery phrase
        </button>
        <button style={btnBase} onClick={() => setGate('derive')}>
          + Add account
        </button>
        <button style={btnDanger} onClick={() => setGate('remove')}>
          Remove
        </button>
      </div>
      <div style={{ marginTop: 'var(--space-sm)' }}>
        {accounts.map((acc) => (
          <AccountRow
            key={`${wallet.id}:${acc.index}`}
            wallet={wallet}
            label={`#${acc.index}`}
            address={acc.address}
            index={acc.index}
            authKey={`${wallet.id}:${acc.index}`}
            onAuthChanged={onAuthChanged}
          />
        ))}
      </div>
      {gate && (
        <SecretGate
          title={
            gate === 'mnemonic'
              ? 'Reveal recovery phrase'
              : gate === 'derive'
                ? 'Derive another account'
                : 'Remove wallet'
          }
          hint={
            gate === 'mnemonic'
              ? 'Enter the vault password to reveal your 24-word recovery phrase.'
              : gate === 'derive'
                ? 'Enter the vault password to derive one more account.'
                : 'This permanently removes the wallet and all its accounts.'
          }
          submitLabel={gate === 'remove' ? (busy ? 'Removing…' : 'Remove') : 'Confirm'}
          onSubmit={onGateSubmit}
          onClose={() => setGate(null)}
        />
      )}
      {secret && <SecretReveal result={secret} onClose={() => setSecret(null)} />}
    </div>
  )
}

const KeyWalletCard: React.FC<{ wallet: WalletMeta; onAuthChanged: () => void }> = ({
  wallet,
  onAuthChanged,
}) => {
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 'var(--font-lg)' }}>{wallet.name}</h3>
        <span
          style={{
            fontSize: 'var(--font-xs)',
            padding: '2px 8px',
            borderRadius: 999,
            background: 'rgba(210,153,34,0.15)',
            color: 'var(--color-warning)',
          }}
        >
          Imported key
        </span>
        <span style={{ flex: 1 }} />
        <button
          style={btnDanger}
          onClick={() => {
            void useWalletStore.getState().remove(wallet.id)
            onAuthChanged()
          }}
        >
          Remove
        </button>
      </div>
      <AccountRow
        wallet={wallet}
        label=""
        address={wallet.address}
        authKey={wallet.id}
        onAuthChanged={onAuthChanged}
      />
    </div>
  )
}

// --- Empty state: create / import -------------------------------------------

const EmptyState: React.FC<{ onChanged: () => void }> = ({ onChanged }) => {
  const createHd = useWalletStore((s) => s.createHd)
  const importHd = useWalletStore((s) => s.importHd)
  const importPrivateKey = useWalletStore((s) => s.importPrivateKey)
  const importKeystore = useWalletStore((s) => s.importKeystore)
  const [mode, setMode] = useState<'create' | 'import'>('create')
  const [importTab, setImportTab] = useState<'mnemonic' | 'key' | 'keystore'>('mnemonic')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [mnemonic, setMnemonic] = useState('')
  const [privateKey, setPrivateKey] = useState('')
  const [keystoreJson, setKeystoreJson] = useState('')
  const [keystorePw, setKeystorePw] = useState('')
  const [accountCount, setAccountCount] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdMnemonic, setCreatedMnemonic] = useState<string | null>(null)

  const reset = () => {
    setName('')
    setPassword('')
    setConfirm('')
    setPassphrase('')
    setMnemonic('')
    setPrivateKey('')
    setKeystoreJson('')
    setKeystorePw('')
    setError(null)
  }

  const submitCreate = async () => {
    setError(null)
    if (!name.trim() || !password) {
      setError('Name and password are required.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setBusy(true)
    try {
      const result = await createHd({
        name: name.trim(),
        password,
        passphrase: passphrase || undefined,
        accountCount,
      })
      setCreatedMnemonic(result.mnemonic)
      reset()
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const submitImport = async () => {
    setError(null)
    if (!name.trim() || !password) {
      setError('Name and password are required.')
      return
    }
    setBusy(true)
    try {
      if (importTab === 'mnemonic') {
        await importHd({
          name: name.trim(),
          mnemonic: mnemonic.trim(),
          password,
          passphrase: passphrase || undefined,
          accountCount,
        })
      } else if (importTab === 'key') {
        await importPrivateKey({ name: name.trim(), privateKey: privateKey.trim(), password })
      } else {
        await importKeystore({
          name: name.trim(),
          keystoreJson,
          keystorePassword: keystorePw,
          password,
        })
      }
      reset()
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 'var(--space-lg)' }}>
        <button
          style={mode === 'create' ? btnPrimary : btnBase}
          onClick={() => setMode('create')}
        >
          Create HD wallet
        </button>
        <button
          style={mode === 'import' ? btnPrimary : btnBase}
          onClick={() => setMode('import')}
        >
          Import
        </button>
      </div>

      {mode === 'create' ? (
        <div style={{ ...cardStyle, maxWidth: 520 }}>
          <h3 style={{ marginTop: 0 }}>Create a new HD wallet</h3>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-sm)' }}>
            One recovery phrase generates as many accounts as you need. An optional passphrase
            acts as an extra salt: a different passphrase produces a completely different set
            of accounts.
          </p>
          <div style={{ display: 'grid', gap: 12 }}>
            <div>
              <label style={labelStyle}>Name</label>
              <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Vault password</label>
              <input
                type="password"
                style={inputStyle}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle}>Confirm password</label>
              <input
                type="password"
                style={inputStyle}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Passphrase (optional)</label>
                <input
                  style={inputStyle}
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                />
              </div>
              <div>
                <label style={labelStyle}>Accounts to generate</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  style={inputStyle}
                  value={accountCount}
                  onChange={(e) => setAccountCount(Math.max(1, Number(e.target.value)))}
                />
              </div>
            </div>
            {error && (
              <p style={{ color: 'var(--color-danger)', fontSize: 'var(--font-sm)', margin: 0 }}>
                {error}
              </p>
            )}
            <button style={btnPrimary} onClick={() => void submitCreate()} disabled={busy}>
              {busy ? 'Creating…' : 'Create wallet'}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ ...cardStyle, maxWidth: 520 }}>
          <h3 style={{ marginTop: 0 }}>Import a wallet</h3>
          <div style={{ display: 'flex', gap: 8, marginBottom: 'var(--space-lg)' }}>
            {(
              [
                ['mnemonic', 'Mnemonic'],
                ['key', 'Private key'],
                ['keystore', 'Keystore JSON'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                style={importTab === id ? btnPrimary : btnBase}
                onClick={() => setImportTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            <div>
              <label style={labelStyle}>Name</label>
              <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            {importTab === 'mnemonic' && (
              <>
                <div>
                  <label style={labelStyle}>Recovery phrase</label>
                  <textarea
                    style={{ ...inputStyle, minHeight: 80, fontFamily: 'monospace' }}
                    value={mnemonic}
                    onChange={(e) => setMnemonic(e.target.value)}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Passphrase (optional)</label>
                    <input
                      style={inputStyle}
                      value={passphrase}
                      onChange={(e) => setPassphrase(e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Accounts to generate</label>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      style={inputStyle}
                      value={accountCount}
                      onChange={(e) => setAccountCount(Math.max(1, Number(e.target.value)))}
                    />
                  </div>
                </div>
              </>
            )}
            {importTab === 'key' && (
              <div>
                <label style={labelStyle}>Private key (hex, with or without 0x)</label>
                <input
                  style={{ ...inputStyle, fontFamily: 'monospace' }}
                  value={privateKey}
                  onChange={(e) => setPrivateKey(e.target.value)}
                />
              </div>
            )}
            {importTab === 'keystore' && (
              <>
                <div>
                  <label style={labelStyle}>Keystore JSON</label>
                  <textarea
                    style={{ ...inputStyle, minHeight: 140, fontFamily: 'monospace' }}
                    value={keystoreJson}
                    onChange={(e) => setKeystoreJson(e.target.value)}
                    placeholder='{"address":"0x…","crypto":{…},"version":3}'
                  />
                </div>
                <div>
                  <label style={labelStyle}>Keystore password</label>
                  <input
                    type="password"
                    style={inputStyle}
                    value={keystorePw}
                    onChange={(e) => setKeystorePw(e.target.value)}
                  />
                </div>
              </>
            )}
            <div>
              <label style={labelStyle}>Vault password (to protect this wallet locally)</label>
              <input
                type="password"
                style={inputStyle}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && (
              <p style={{ color: 'var(--color-danger)', fontSize: 'var(--font-sm)', margin: 0 }}>
                {error}
              </p>
            )}
            <button style={btnPrimary} onClick={() => void submitImport()} disabled={busy}>
              {busy ? 'Importing…' : 'Import wallet'}
            </button>
          </div>
        </div>
      )}

      {createdMnemonic && (
        <Modal title="Your recovery phrase - write it down" onClose={() => setCreatedMnemonic(null)}>
          <div
            style={{
              background: 'var(--color-bg-tertiary)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              padding: 'var(--space-lg)',
              fontFamily: 'monospace',
              fontSize: 'var(--font-sm)',
              lineHeight: 1.8,
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '4px 12px',
            }}
          >
            {createdMnemonic.split(' ').map((word, i) => (
              <div key={word + i}>
                <span style={{ color: 'var(--color-text-muted)' }}>{i + 1}.</span> {word}
              </div>
            ))}
          </div>
          <p style={{ color: 'var(--color-warning)', fontSize: 'var(--font-sm)' }}>
            This is the only time the full phrase is shown. Losing it means losing access to
            every account derived from it.
          </p>
          <button style={btnPrimary} onClick={() => setCreatedMnemonic(null)}>
            I saved it
          </button>
        </Modal>
      )}
    </div>
  )
}

// --- Main view --------------------------------------------------------------

const Wallets: React.FC = () => {
  const { unlocked, empty, wallets, authorized, loading, error, refresh, unlock, lock, revokeAll } =
    useWalletStore()
  const [unlockOpen, setUnlockOpen] = useState(false)

  useEffect(() => {
    void refresh()
  }, [refresh])

  const onAuthChanged = useCallback(() => {
    void refresh()
  }, [refresh])

  return (
    <div style={{ padding: 'var(--space-xl)', maxWidth: 860 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>Wallets</h2>
        <span
          style={{
            fontSize: 'var(--font-xs)',
            padding: '3px 10px',
            borderRadius: 999,
            background: unlocked
              ? 'rgba(63,185,80,0.15)'
              : 'rgba(139,148,158,0.15)',
            color: unlocked ? 'var(--color-success)' : 'var(--color-text-secondary)',
          }}
        >
          {unlocked ? '● Unlocked' : '○ Locked'}
        </span>
        <span
          style={{
            fontSize: 'var(--font-xs)',
            padding: '3px 10px',
            borderRadius: 999,
            background: 'rgba(210,153,34,0.12)',
            color: 'var(--color-warning)',
          }}
        >
          {authorized.length} agent auth{authorized.length === 1 ? '' : 's'}
        </span>
        <span style={{ flex: 1 }} />
        {unlocked ? (
          <>
            <button style={btnBase} onClick={() => void lock()}>
              Lock vault
            </button>
            <button style={btnBase} onClick={() => void revokeAll()} disabled={authorized.length === 0}>
              Revoke all agents
            </button>
          </>
        ) : (
          <button style={btnPrimary} onClick={() => setUnlockOpen(true)} disabled={empty}>
            Unlock
          </button>
        )}
      </div>

      {error && (
        <div
          style={{
            marginTop: 'var(--space-lg)',
            padding: '10px 14px',
            borderRadius: 8,
            background: 'rgba(248,81,73,0.1)',
            border: '1px solid rgba(248,81,73,0.3)',
            color: 'var(--color-danger)',
            fontSize: 'var(--font-sm)',
          }}
        >
          {error}
        </div>
      )}

      {loading && !empty && (
        <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-sm)' }}>Loading…</p>
      )}

      <div style={{ marginTop: 'var(--space-xl)' }}>
        {empty ? (
          <>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-sm)' }}>
              Your vault is empty. Create an HD wallet from a fresh recovery phrase, or import
              an existing one. Secrets are encrypted locally and never leave this machine.
            </p>
            <EmptyState onChanged={onAuthChanged} />
          </>
        ) : (
          <div style={{ display: 'grid', gap: 'var(--space-lg)' }}>
            {wallets.map((wallet) =>
              wallet.kind === 'hd' ? (
                <HdWalletCard key={wallet.id} wallet={wallet} onAuthChanged={onAuthChanged} />
              ) : (
                <KeyWalletCard key={wallet.id} wallet={wallet} onAuthChanged={onAuthChanged} />
              ),
            )}
          </div>
        )}
      </div>

      {unlockOpen && (
        <SecretGate
          title="Unlock vault"
          hint="Enter your vault password to unlock this session."
          submitLabel="Unlock"
          onSubmit={async (password) => {
            await unlock(password)
            setUnlockOpen(false)
          }}
          onClose={() => setUnlockOpen(false)}
        />
      )}
    </div>
  )
}

export default Wallets
