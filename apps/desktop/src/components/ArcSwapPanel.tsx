/**
 * ArcSwapPanel - 95-style live swap dialog for ARC Testnet (M5-5).
 *
 * Flow: pick an authorized wallet -> enter token + amount -> quote from
 * the live Uniswap v4 pool -> human confirm -> local sign + broadcast
 * through the main process (private key never leaves it). Shows the
 * resulting tx hash + explorer link + on-chain status.
 */

import React, { useEffect, useState } from 'react'
import { useWalletStore } from '../stores/walletStore'
import { useAgentStore } from '../stores/agentStore'

const EXPLORER_TX = 'https://testnet.arcscan.app/tx/'

interface Props {
  open: boolean
  direction: 'buy' | 'sell'
  symbol: string
  onClose: () => void
}

const field = (flex = 1): React.CSSProperties => ({
  flex,
  background: '#fff',
  color: '#000',
  border: '2px inset',
  borderColor: '#808080 #fff #fff #808080',
  padding: '2px 6px',
  fontSize: 11,
  fontFamily: 'inherit',
})

const ArcSwapPanel: React.FC<Props> = ({ open, direction, symbol, onClose }) => {
  const authorized = useWalletStore((s) => s.authorized)
  const wallets = useWalletStore((s) => s.wallets)
  const refreshWallets = useWalletStore((s) => s.refresh)
  const agents = useAgentStore((s) => s.agents)

  const [accountKey, setAccountKey] = useState('')
  const [token, setToken] = useState('')
  const [hooks, setHooks] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [quote, setQuote] = useState<string | null>(null)
  const [result, setResult] = useState<{ hash: string; status: 'pending' | 'success' | 'reverted' } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) void refreshWallets()
  }, [open, refreshWallets])

  // All agent-authorized wallet accounts (walletId or walletId:index).
  const accounts = wallets.flatMap((w) => {
    if (w.kind === 'hd' && w.accounts && w.accounts.length > 0) {
      return w.accounts.map((a) => ({
        key: `${w.id}:${a.index}`,
        label: `${w.name} #${a.index + 1}`,
        address: a.address,
      }))
    }
    return [{ key: w.id, label: w.name, address: w.address }]
  }).filter((o) => authorized.includes(o.key))

  const [walletId, indexStr] = accountKey.includes(':')
    ? accountKey.split(':')
    : [accountKey, undefined]
  const index = indexStr === undefined ? undefined : Number(indexStr)

  const isBuy = direction === 'buy'

  const amountBase = () => {
    const n = Number(amount)
    if (!Number.isFinite(n) || n <= 0) return null
    return isBuy ? BigInt(Math.round(n * 1e18)) : BigInt(Math.round(n * 1e6))
  }

  const doQuote = async () => {
    const amt = amountBase()
    const tok = token.trim()
    if (!amt || !tok) {
      setError('Enter a token address and an amount first.')
      return
    }
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const res = await window.vibeAPI.arc.quote({
        token: tok,
        zeroForOne: isBuy,
        amountIn: amt.toString(),
        hooks: hooks.trim() || undefined,
      })
      const out = BigInt(res.amountOut)
      setQuote(isBuy ? `${(Number(out) / 1e6).toPrecision(6)} tokens` : `${(Number(out) / 1e18).toPrecision(6)} USDC`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const doSwap = async () => {
    const amt = amountBase()
    const tok = token.trim()
    if (!amt || !tok || !accountKey) {
      setError('Pick an authorized wallet, a token address and an amount.')
      return
    }
    // Ask the live pool for a minimum-out (2.5% slippage) first.
    setBusy(true)
    setError(null)
    try {
      const q = await window.vibeAPI.arc.quote({
        token: tok,
        zeroForOne: isBuy,
        amountIn: amt.toString(),
        hooks: hooks.trim() || undefined,
      })
      const minOut = (BigInt(q.amountOut) * 9750n) / 10000n
      const { hash } = await window.vibeAPI.arc.swap({
        walletId,
        index,
        token: tok,
        zeroForOne: isBuy,
        amountIn: amt.toString(),
        amountOutMinimum: minOut.toString(),
        hooks: hooks.trim() || undefined,
      })
      setResult({ hash, status: 'pending' })
      const receipt = await window.vibeAPI.arc.waitReceipt(hash)
      setResult({ hash, status: receipt.status })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  const agentNames = new Map(agents.map((a) => [a.id, a.name]))

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.35)',
        zIndex: 5000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 430,
          maxWidth: '92vw',
          background: '#c0c0c0',
          border: '2px outset',
          borderColor: '#fff #404040 #404040 #fff',
          boxShadow: '4px 4px 0 rgba(0,0,0,0.4)',
          fontFamily: 'MS Sans Serif, Arial, sans-serif',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title bar */}
        <div
          style={{
            background: 'linear-gradient(90deg,#000080,#1084d0)',
            color: '#fff',
            fontSize: 12,
            fontWeight: 700,
            padding: '4px 8px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span>🦄 ARC Testnet · {isBuy ? `Buy` : `Sell`} {symbol}</span>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 10, fontWeight: 400 }}>
            {accounts.length} wallet{accounts.length === 1 ? '' : 's'} authorized
          </span>
          <button
            onClick={onClose}
            style={{
              background: '#c0c0c0',
              border: '2px outset',
              borderColor: '#fff #404040 #404040 #fff',
              fontSize: 10,
              width: 18,
              height: 18,
              lineHeight: 1,
              cursor: 'pointer',
              color: '#000',
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {agents.length > 0 && (
            <div style={{ fontSize: 10, color: '#333' }}>
              🤖 Recommended by agent:{' '}
              {agents
                .filter((a) => a.symbols.includes(symbol))
                .map((a) => agentNames.get(a.id))
                .filter(Boolean)
                .join(', ') || '—'}
            </div>
          )}

          <label style={{ fontSize: 11, color: '#000', display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ width: 60 }}>Wallet</span>
            <select
              style={field()}
              value={accountKey}
              onChange={(e) => setAccountKey(e.target.value)}
            >
              <option value="">Select authorized wallet…</option>
              {accounts.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label} · {o.address.slice(0, 8)}…
                </option>
              ))}
            </select>
          </label>

          <label style={{ fontSize: 11, color: '#000', display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ width: 60 }}>Token</span>
            <input
              style={field()}
              placeholder="0x… (Minara / Uniswap v4 pool token)"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </label>

          <label style={{ fontSize: 11, color: '#000', display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ width: 60 }}>Hooks</span>
            <input
              style={field()}
              placeholder="Pool hook (blank = zero address)"
              value={hooks}
              onChange={(e) => setHooks(e.target.value)}
            />
          </label>

          <label style={{ fontSize: 11, color: '#000', display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ width: 60 }}>{isBuy ? 'USDC' : 'Tokens'}</span>
            <input
              style={field()}
              type="number"
              min={0}
              placeholder={isBuy ? 'Amount in USDC (native)' : 'Amount in tokens'}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>

          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              style={{
                fontSize: 11,
                padding: '3px 12px',
                background: '#c0c0c0',
                border: '2px outset',
                borderColor: '#fff #404040 #404040 #fff',
                color: '#000',
                cursor: 'pointer',
                fontWeight: 700,
              }}
              disabled={busy}
              onClick={() => void doQuote()}
            >
              {busy ? 'Quoting…' : 'Quote'}
            </button>
            {quote && (
              <span style={{ fontSize: 11, color: '#060' }}>≈ {quote}</span>
            )}
          </div>

          {error && (
            <div
              style={{
                fontSize: 10,
                color: '#a00',
                border: '1px inset',
                borderColor: '#808080 #fff #fff #808080',
                background: '#fff',
                padding: '4px 8px',
                wordBreak: 'break-word',
              }}
            >
              {error}
            </div>
          )}

          {result && (
            <div
              style={{
                fontSize: 10,
                border: '1px inset',
                borderColor: '#808080 #fff #fff #808080',
                background: '#fff',
                padding: '4px 8px',
                wordBreak: 'break-all',
                color: result.status === 'reverted' ? '#a00' : '#060',
              }}
            >
              {result.status === 'pending' && '⏳ Broadcasting…'}
              {result.status === 'success' && '✅ On-chain success.'}
              {result.status === 'reverted' && '❌ Transaction reverted.'}
              <br />
              <a
                href={`${EXPLORER_TX}${result.hash}`}
                target="_blank"
                rel="noreferrer"
                style={{ color: '#0000ee' }}
              >
                {result.hash}
              </a>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button
              style={{
                fontSize: 11,
                padding: '3px 14px',
                background: '#c0c0c0',
                border: '2px outset',
                borderColor: '#fff #404040 #404040 #fff',
                color: '#000',
                cursor: 'pointer',
              }}
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              style={{
                fontSize: 11,
                padding: '3px 14px',
                background: '#c0c0c0',
                border: '2px outset',
                borderColor: '#fff #404040 #404040 #fff',
                color: isBuy ? '#008000' : '#a00',
                cursor: 'pointer',
                fontWeight: 700,
              }}
              disabled={busy || !accountKey}
              onClick={() => void doSwap()}
            >
              {busy ? 'Working…' : `Confirm & ${isBuy ? 'Buy' : 'Sell'}`}
            </button>
          </div>
          <div style={{ fontSize: 9, color: '#555' }}>
            Private key stays in the main process. Quote includes pool + hook fees; min-out uses
            2.5% slippage. Chain: Arc Testnet (5042002), gas = native USDC.
          </div>
        </div>
      </div>
    </div>
  )
}

export default ArcSwapPanel
