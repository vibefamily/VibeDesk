/**
 * Wallets view - local-first multi-wallet vault (Windows 95 style).
 *
 * Security model:
 * - The vault lives in the Electron main process; the renderer only sees
 *   address-level metadata.
 * - Viewing / exporting a private key, mnemonic or keystore always
 *   requires the vault password again (MetaMask-style).
 * - Agent access is granted per wallet in memory only and can be
 *   revoked at any time.
 * - Create / import is available both on an empty vault and via
 *   "Add wallet" once wallets exist.
 */

import React, { useCallback, useEffect, useState } from 'react'
import type { WalletMeta } from '../types/wallet'
import { useWalletStore } from '../stores/walletStore'

// --- Windows 95 primitives --------------------------------------------------

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
  padding: 10,
}

function shortAddr(address: string): string {
  if (address.length <= 14) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

/** Windows 95 dialog: blue title bar + grey body. */
const Win95Modal: React.FC<{
  title: string
  onClose: () => void
  children: React.ReactNode
  width?: number
}> = ({ title, onClose, children, width = 520 }) => (
  <div
    style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.45)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
    }}
    onClick={onClose}
  >
    <div
      style={{
        width,
        maxWidth: '94vw',
        background: '#c0c0c0',
        border: '2px outset',
        borderColor: '#fff #404040 #404040 #fff',
        boxShadow: '4px 4px 8px rgba(0,0,0,0.4)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        style={{
          background: 'linear-gradient(90deg, #000080, #1084d0)',
          padding: '2px 3px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>{title}</span>
        <button
          style={{
            width: 16,
            height: 14,
            padding: 0,
            fontSize: 9,
            fontWeight: 700,
            lineHeight: '12px',
            background: '#c0c0c0',
            border: '2px outset',
            borderColor: '#fff #808080 #808080 #fff',
            cursor: 'pointer',
          }}
          onClick={onClose}
          title="Close"
        >
          ✕
        </button>
      </div>
      <div style={{ padding: 10 }}>{children}</div>
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
    <Win95Modal title={title} onClose={onClose} width={460}>
      <p style={{ marginTop: 0, fontSize: 11, color: '#000' }}>{hint}</p>
      <input
        type="password"
        placeholder="Vault password"
        style={input}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && void submit()}
        autoFocus
      />
      {error && <p style={{ color: '#a00', fontSize: 11, margin: '8px 0 0' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <button style={btnPrimary} onClick={() => void submit()} disabled={busy || !password}>
          {submitLabel}
        </button>
        <button style={btn} onClick={onClose}>
          Cancel
        </button>
      </div>
    </Win95Modal>
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
    <Win95Modal title={result.kind === 'mnemonic' ? 'Recovery phrase' : 'Private key'} onClose={onClose}>
      <div
        style={{
          background: '#fff',
          border: '2px inset',
          borderColor: '#808080 #fff #fff #808080',
          padding: 8,
          fontFamily: 'monospace',
          fontSize: 12,
          wordBreak: 'break-all',
          lineHeight: 1.7,
          maxHeight: 220,
          overflow: 'auto',
          color: '#000',
        }}
      >
        {result.value}
      </div>
      <p style={{ color: '#a00', fontSize: 11 }}>
        Anyone with this can control your funds. Store it offline and never screenshot it.
      </p>
      <div style={{ display: 'flex', gap: 6 }}>
        <button style={btnPrimary} onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button style={btn} onClick={onClose}>
          Close
        </button>
      </div>
    </Win95Modal>
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
        gap: 8,
        padding: '6px 2px',
        borderTop: '1px solid #808080',
        flexWrap: 'wrap',
      }}
    >
      <span style={{ color: '#000', fontSize: 11, width: 26 }}>{label}</span>
      <code style={{ color: '#000', fontSize: 11 }}>{shortAddr(address)}</code>
      <span style={{ flex: 1 }} />
      <button style={btn} onClick={copy}>
        {copied ? '✓' : 'Copy'}
      </button>
      <button style={btn} onClick={() => setGate('key')}>
        Private key
      </button>
      <button style={btn} onClick={() => setGate('keystore')}>
        Keystore
      </button>
      {authorized ? (
        <button
          style={{ ...btn, color: '#060' }}
          onClick={() => {
            void revokeAgent({ walletId: wallet.id, index })
            onAuthChanged()
          }}
        >
          Agent ✓
        </button>
      ) : (
        <button style={btn} onClick={() => setGate('agent')}>
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
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 14, color: '#000' }}>{wallet.name}</h3>
        <span
          style={{
            fontSize: 10,
            border: '1px inset',
            borderColor: '#808080 #fff #fff #808080',
            padding: '1px 6px',
            background: '#c0c0c0',
            color: '#000',
          }}
        >
          HD · {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}
        </span>
        <span style={{ flex: 1 }} />
        <button style={btn} onClick={() => setGate('mnemonic')}>
          Recovery phrase
        </button>
        <button style={btn} onClick={() => setGate('derive')}>
          + Add account
        </button>
        <button style={btnDanger} onClick={() => setGate('remove')}>
          Remove
        </button>
      </div>
      <div style={{ marginTop: 6 }}>
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
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 14, color: '#000' }}>{wallet.name}</h3>
        <span
          style={{
            fontSize: 10,
            border: '1px inset',
            borderColor: '#808080 #fff #fff #808080',
            padding: '1px 6px',
            background: '#c0c0c0',
            color: '#000',
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

// --- Create / import form (shared by empty state and Add wallet) -------------

const AddWalletForm: React.FC<{ onDone: () => void; compact?: boolean }> = ({
  onDone,
  compact,
}) => {
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
      onDone()
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
      onDone()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <button style={mode === 'create' ? btnPrimary : btn} onClick={() => setMode('create')}>
          Create HD wallet
        </button>
        <button style={mode === 'import' ? btnPrimary : btn} onClick={() => setMode('import')}>
          Import
        </button>
      </div>

      {mode === 'create' ? (
        <div style={{ maxWidth: 520 }}>
          <p style={{ marginTop: 0, fontSize: 11, color: '#000' }}>
            One recovery phrase generates as many accounts as you need. An optional passphrase
            acts as an extra salt: a different passphrase produces a completely different set of
            accounts.
          </p>
          <div style={{ display: 'grid', gap: 8 }}>
            <div>
              <label style={label}>Name</label>
              <input style={input} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label style={label}>Vault password</label>
              <input
                type="password"
                style={input}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div>
              <label style={label}>Confirm password</label>
              <input
                type="password"
                style={input}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <label style={label}>Passphrase (optional)</label>
                <input
                  style={input}
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                />
              </div>
              <div>
                <label style={label}>Accounts to generate</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  style={input}
                  value={accountCount}
                  onChange={(e) => setAccountCount(Math.max(1, Number(e.target.value)))}
                />
              </div>
            </div>
            {error && <p style={{ color: '#a00', fontSize: 11, margin: 0 }}>{error}</p>}
            <div>
              <button style={btnPrimary} onClick={() => void submitCreate()} disabled={busy}>
                {busy ? 'Creating…' : 'Create wallet'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ maxWidth: 520 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {(
              [
                ['mnemonic', 'Mnemonic'],
                ['key', 'Private key'],
                ['keystore', 'Keystore JSON'],
              ] as const
            ).map(([id, lbl]) => (
              <button
                key={id}
                style={importTab === id ? btnPrimary : btn}
                onClick={() => setImportTab(id)}
              >
                {lbl}
              </button>
            ))}
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            <div>
              <label style={label}>Name</label>
              <input style={input} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            {importTab === 'mnemonic' && (
              <>
                <div>
                  <label style={label}>Recovery phrase</label>
                  <textarea
                    style={{ ...input, minHeight: 70, fontFamily: 'monospace' }}
                    value={mnemonic}
                    onChange={(e) => setMnemonic(e.target.value)}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label style={label}>Passphrase (optional)</label>
                    <input
                      style={input}
                      value={passphrase}
                      onChange={(e) => setPassphrase(e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={label}>Accounts to generate</label>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      style={input}
                      value={accountCount}
                      onChange={(e) => setAccountCount(Math.max(1, Number(e.target.value)))}
                    />
                  </div>
                </div>
              </>
            )}
            {importTab === 'key' && (
              <div>
                <label style={label}>Private key (hex, with or without 0x)</label>
                <input
                  style={{ ...input, fontFamily: 'monospace' }}
                  value={privateKey}
                  onChange={(e) => setPrivateKey(e.target.value)}
                />
              </div>
            )}
            {importTab === 'keystore' && (
              <>
                <div>
                  <label style={label}>Keystore JSON</label>
                  <textarea
                    style={{ ...input, minHeight: 120, fontFamily: 'monospace' }}
                    value={keystoreJson}
                    onChange={(e) => setKeystoreJson(e.target.value)}
                    placeholder='{"address":"0x…","crypto":{…},"version":3}'
                  />
                </div>
                <div>
                  <label style={label}>Keystore password</label>
                  <input
                    type="password"
                    style={input}
                    value={keystorePw}
                    onChange={(e) => setKeystorePw(e.target.value)}
                  />
                </div>
              </>
            )}
            <div>
              <label style={label}>Vault password (to protect this wallet locally)</label>
              <input
                type="password"
                style={input}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && <p style={{ color: '#a00', fontSize: 11, margin: 0 }}>{error}</p>}
            <div>
              <button style={btnPrimary} onClick={() => void submitImport()} disabled={busy}>
                {busy ? 'Importing…' : 'Import wallet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {createdMnemonic && (
        <Win95Modal title="Your recovery phrase - write it down" onClose={() => setCreatedMnemonic(null)}>
          <div
            style={{
              background: '#fff',
              border: '2px inset',
              borderColor: '#808080 #fff #fff #808080',
              padding: 8,
              fontFamily: 'monospace',
              fontSize: 12,
              lineHeight: 1.8,
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '4px 12px',
              color: '#000',
              maxHeight: 260,
              overflow: 'auto',
            }}
          >
            {createdMnemonic.split(' ').map((word, i) => (
              <div key={word + i}>
                <span style={{ color: '#666' }}>{i + 1}.</span> {word}
              </div>
            ))}
          </div>
          <p style={{ color: '#a00', fontSize: 11 }}>
            This is the only time the full phrase is shown. Losing it means losing access to
            every account derived from it.
          </p>
          <button style={btnPrimary} onClick={() => setCreatedMnemonic(null)}>
            I saved it
          </button>
        </Win95Modal>
      )}
    </div>
  )
}

// --- Empty state ------------------------------------------------------------

const EmptyState: React.FC<{ onChanged: () => void }> = ({ onChanged }) => (
  <div>
    <p style={{ fontSize: 11, color: '#000', marginTop: 0 }}>
      Your vault is empty. Create an HD wallet from a fresh recovery phrase, or import an
      existing one. Secrets are encrypted locally and never leave this machine.
    </p>
    <AddWalletForm onDone={onChanged} />
  </div>
)

// --- Main view --------------------------------------------------------------

const Wallets: React.FC = () => {
  const { unlocked, empty, wallets, authorized, loading, error, refresh, unlock, lock, revokeAll } =
    useWalletStore()
  const [unlockOpen, setUnlockOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  useEffect(() => {
    void refresh()
  }, [refresh])

  const onAuthChanged = useCallback(() => {
    void refresh()
  }, [refresh])

  return (
    <div style={{ padding: 10, maxWidth: 900, background: '#c0c0c0', color: '#000' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 16, color: '#000' }}>Wallets</h2>
        <span
          style={{
            fontSize: 10,
            border: '1px inset',
            borderColor: '#808080 #fff #fff #808080',
            padding: '1px 6px',
            background: unlocked ? '#c0c0c0' : '#c0c0c0',
            color: unlocked ? '#060' : '#000',
          }}
        >
          {unlocked ? '● Unlocked' : '○ Locked'}
        </span>
        <span
          style={{
            fontSize: 10,
            border: '1px inset',
            borderColor: '#808080 #fff #fff #808080',
            padding: '1px 6px',
            background: '#c0c0c0',
            color: '#000',
          }}
        >
          {authorized.length} agent auth{authorized.length === 1 ? '' : 's'}
        </span>
        <span style={{ flex: 1 }} />
        {!empty && (
          <button style={btnPrimary} onClick={() => setAddOpen(true)}>
            + Add wallet
          </button>
        )}
        {unlocked ? (
          <>
            <button style={btn} onClick={() => void lock()}>
              Lock vault
            </button>
            <button style={btn} onClick={() => void revokeAll()} disabled={authorized.length === 0}>
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
            marginTop: 10,
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

      {loading && !empty && (
        <p style={{ fontSize: 11, color: '#000' }}>Loading…</p>
      )}

      <div style={{ marginTop: 12 }}>
        {empty ? (
          <EmptyState onChanged={onAuthChanged} />
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
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

      {addOpen && (
        <Win95Modal title="Add wallet" onClose={() => setAddOpen(false)} width={560}>
          <AddWalletForm onDone={() => setAddOpen(false)} />
        </Win95Modal>
      )}
    </div>
  )
}

export default Wallets
