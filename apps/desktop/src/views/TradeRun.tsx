/**
 * TradeRun - the Agent Trade Run closed loop (M6, hackathon showcase).
 *
 * One window that tells the whole story:
 *
 *   Signal (agent analysis) -> Intent -> Quote -> Authorize -> Sign
 *   -> Broadcast -> Receipt
 *
 * The left column shows the agent's latest structured analysis (rule
 * mode emits `analysis` events; LLM mode keeps text-only output). The
 * right column drives a real Uniswap v4 swap on Arc through the main
 * process - the private key never leaves it. Human confirms each
 * execution: the agent proposes, the user disposes.
 */

import React, { useMemo, useState } from 'react'
import { useAgentStore, type StockAnalysisView } from '../stores/agentStore'
import { useWalletStore } from '../stores/walletStore'

const EXPLORER_TX = 'https://testnet.arcscan.app/tx/'

type StepId =
  | 'signal'
  | 'intent'
  | 'quote'
  | 'authorize'
  | 'sign'
  | 'broadcast'
  | 'receipt'

type StepState = 'pending' | 'active' | 'done' | 'error' | 'skipped'

interface StepDef {
  id: StepId
  label: string
  hint: string
}

const STEPS: StepDef[] = [
  { id: 'signal', label: 'Signal', hint: 'Agent analysis from live multi-source prices' },
  { id: 'intent', label: 'Intent', hint: 'Side & confidence derived from the signal' },
  { id: 'quote', label: 'Quote', hint: 'Uniswap v4 Quoter, fees included' },
  { id: 'authorize', label: 'Authorize', hint: 'Permit2 approvals (sell path)' },
  { id: 'sign', label: 'Sign', hint: 'Local signing in the main process' },
  { id: 'broadcast', label: 'Broadcast', hint: 'Universal Router transaction sent' },
  { id: 'receipt', label: 'Receipt', hint: 'On-chain confirmation' },
]

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

const btnStyle = (primary = false): React.CSSProperties => ({
  fontSize: 11,
  padding: '3px 12px',
  background: '#c0c0c0',
  border: '2px outset',
  borderColor: '#fff #404040 #404040 #fff',
  color: primary ? '#000080' : '#000',
  cursor: 'pointer',
  fontWeight: 700,
})

const ACTION_COLOR: Record<string, string> = {
  BUY: '#008000',
  SELL: '#a00000',
  HOLD: '#606060',
}

const stepStateStyle = (s: StepState): React.CSSProperties => ({
  display: 'inline-block',
  minWidth: 62,
  textAlign: 'center',
  fontSize: 10,
  fontWeight: 700,
  padding: '1px 6px',
  border: '1px solid #808080',
  background: s === 'done' ? '#008000' : s === 'error' ? '#a00000' : s === 'active' ? '#000080' : '#c0c0c0',
  color: s === 'done' || s === 'error' || s === 'active' ? '#fff' : '#000',
})

const TradeRun: React.FC = () => {
  const agents = useAgentStore((s) => s.agents)
  const runOnce = useAgentStore((s) => s.runOnce)
  const wallets = useWalletStore((s) => s.wallets)
  const authorized = useWalletStore((s) => s.authorized)
  const refreshWallets = useWalletStore((s) => s.refresh)

  const withSignals = useMemo(
    () => agents.filter((a) => a.lastAnalysis != null),
    [agents],
  )

  const [agentId, setAgentId] = useState('')
  const selected = agents.find((a) => a.id === agentId) ?? withSignals[0] ?? agents[0]
  const analysis: StockAnalysisView | null = selected?.lastAnalysis ?? null

  // --- Execution state ---
  const [accountKey, setAccountKey] = useState('')
  const [token, setToken] = useState('')
  const [amount, setAmount] = useState('')
  const [steps, setSteps] = useState<Record<StepId, StepState>>({
    signal: 'pending',
    intent: 'pending',
    quote: 'pending',
    authorize: 'pending',
    sign: 'pending',
    broadcast: 'pending',
    receipt: 'pending',
  })
  const [quoteOut, setQuoteOut] = useState<string | null>(null)
  const [tokenDecimals, setTokenDecimals] = useState(18)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ hash: string; status: 'pending' | 'success' | 'reverted' } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Refresh wallet authorization list whenever the panel mounts.
  React.useEffect(() => {
    void refreshWallets()
  }, [refreshWallets])

  // --- Derived ---
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

  const side: 'buy' | 'sell' | null =
    analysis?.action === 'BUY' ? 'buy' : analysis?.action === 'SELL' ? 'sell' : null

  const refreshSignal = async () => {
    if (!selected) return
    setError(null)
    setResult(null)
    setSteps((s) => ({ ...s, signal: 'active' }))
    try {
      await runOnce(selected.id)
      setSteps((s) => ({ ...s, signal: 'done' }))
    } catch (e) {
      setSteps((s) => ({ ...s, signal: 'error' }))
      setError((e as Error).message)
    }
  }

  const mark = (patch: Partial<Record<StepId, StepState>>) =>
    setSteps((s) => ({ ...s, ...patch }))

  const doExecute = async () => {
    if (!analysis || !side) {
      setError('No actionable signal (agent must say BUY or SELL).')
      return
    }
    const tok = token.trim()
    if (!tok || !Number(amount) || Number(amount) <= 0 || !accountKey) {
      setError('Pick an authorized wallet, a token address and an amount.')
      return
    }
    const [walletId, indexStr] = accountKey.includes(':')
      ? accountKey.split(':')
      : [accountKey, undefined]
    const index = indexStr === undefined ? undefined : Number(indexStr)

    setBusy(true)
    setError(null)
    setResult(null)
    mark({ intent: 'done', quote: 'active' })
    try {
      // 1) Live quote through the V4 Quoter (also probes token decimals).
      //    Minara tokens are 18dp, same as native USDC, so the input
      //    amount scales by 10^18 for both directions.
      const scale = 10 ** 18
      const probe = await window.vibeAPI.arc.quote({
        token: tok,
        zeroForOne: side === 'buy',
        amountIn: (10n ** 18n).toString(),
      })
      setTokenDecimals(probe.decimals)
      const amt = BigInt(Math.round(Number(amount) * scale))
      const q = await window.vibeAPI.arc.quote({
        token: tok,
        zeroForOne: side === 'buy',
        amountIn: amt.toString(),
      })
      const dec = q.decimals
      setQuoteOut(
        side === 'buy'
          ? `${(Number(q.amountOut) / 10 ** dec).toPrecision(6)} tokens`
          : `${(Number(q.amountOut) / 10 ** dec).toPrecision(6)} USDC`,
      )
      mark({ quote: 'done', authorize: 'active' })

      // 2) Swap: main process handles Permit2 approvals (sell only),
      //    local signing and broadcast in one call.
      const minOut = (BigInt(q.amountOut) * 9750n) / 10000n
      const { hash } = await window.vibeAPI.arc.swap({
        walletId,
        index,
        token: tok,
        zeroForOne: side === 'buy',
        amountIn: amt.toString(),
        amountOutMinimum: minOut.toString(),
      })
      mark({ authorize: 'done', sign: 'done', broadcast: 'done', receipt: 'active' })
      setResult({ hash, status: 'pending' })

      // 3) Wait for on-chain confirmation.
      const receipt = await window.vibeAPI.arc.waitReceipt(hash)
      mark({ receipt: receipt.status === 'success' ? 'done' : 'error' })
      setResult({ hash, status: receipt.status })
    } catch (e) {
      mark({ receipt: 'error' })
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#c0c0c0',
        fontFamily: 'MS Sans Serif, Arial, sans-serif',
      }}
    >
      {/* Header strip */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 8px',
          borderBottom: '2px solid #808080',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 700, color: '#000' }}>Agent Trade Run</span>
        <select
          style={{ ...field(0), maxWidth: 220 }}
          value={selected?.id ?? ''}
          onChange={(e) => setAgentId(e.target.value)}
        >
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} {a.lastAnalysis ? `· ${a.lastAnalysis.symbol}` : '· no signal yet'}
            </option>
          ))}
        </select>
        <button style={btnStyle()} onClick={() => void refreshSignal()} disabled={busy || !selected}>
          {selected?.status === 'running' ? 'Analyzing…' : 'Refresh signal'}
        </button>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: '#333' }}>
          Chain: Arc Testnet (5042002) · gas = native USDC
        </span>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left: signal card */}
        <div style={{ width: '46%', minWidth: 280, padding: 8, overflow: 'auto', borderRight: '2px solid #808080' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#000', marginBottom: 6 }}>
            SIGNAL — agent analysis (multi-source)
          </div>
          {!analysis ? (
            <div style={{ fontSize: 11, color: '#333', border: '1px inset', borderColor: '#808080 #fff #fff #808080', background: '#fff', padding: 8 }}>
              No structured signal yet. Pick an agent above and hit{' '}
              <b>Refresh signal</b> (rule mode) or ask the agent to analyze a
              symbol in chat (LLM mode returns text only).
            </div>
          ) : (
            <div style={{ border: '1px inset', borderColor: '#808080 #fff #fff #808080', background: '#fff', padding: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: '#000' }}>{analysis.symbol}</span>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 8px', border: '1px solid #000', color: ACTION_COLOR[analysis.action] }}>
                  {analysis.action}
                </span>
                <span style={{ fontSize: 11, color: '#333' }}>
                  confidence {(analysis.confidence * 100).toFixed(0)}%
                </span>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 9, color: '#555' }}>
                  {analysis.sourceCount} sources
                </span>
              </div>
              <div style={{ fontSize: 10, color: '#333', marginTop: 6 }}>
                {analysis.spreadPct != null && `spread ${analysis.spreadPct.toFixed(2)}% · `}
                {analysis.change24hPct != null && `24h ${analysis.change24hPct >= 0 ? '+' : ''}${analysis.change24hPct.toFixed(2)}%`}
              </div>
              <div style={{ fontSize: 10, color: '#000', marginTop: 6 }}>{analysis.summary}</div>
              {analysis.reasons.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#006' }}>REASONS</div>
                  {analysis.reasons.map((r, i) => (
                    <div key={i} style={{ fontSize: 10, color: '#222', marginTop: 2 }}>• {r}</div>
                  ))}
                </div>
              )}
              {analysis.risks.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#600' }}>RISKS</div>
                  {analysis.risks.map((r, i) => (
                    <div key={i} style={{ fontSize: 10, color: '#222', marginTop: 2 }}>• {r}</div>
                  ))}
                </div>
              )}
              <div style={{ fontSize: 9, color: '#777', marginTop: 8 }}>
                analyzed {new Date(analysis.analyzedAt).toLocaleTimeString()}
              </div>
            </div>
          )}
        </div>

        {/* Right: execution pipeline */}
        <div style={{ flex: 1, padding: 8, overflow: 'auto' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#000', marginBottom: 6 }}>
            EXECUTION — Uniswap v4 on Arc (human-confirmed)
          </div>

          {/* Pipeline */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 4,
              border: '1px inset',
              borderColor: '#808080 #fff #fff #808080',
              background: '#fff',
              padding: 8,
              marginBottom: 8,
            }}
          >
            {STEPS.map((s, i) => (
              <React.Fragment key={s.id}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <span style={stepStateStyle(steps[s.id])}>{s.id.toUpperCase()}</span>
                  <span style={{ fontSize: 8, color: '#555', maxWidth: 70, textAlign: 'center' }}>{s.hint}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <span style={{ alignSelf: 'flex-start', marginTop: 6, color: '#808080', fontSize: 11 }}>→</span>
                )}
              </React.Fragment>
            ))}
          </div>

          {/* Params */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ fontSize: 11, color: '#000', display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ width: 60 }}>Wallet</span>
              <select style={field()} value={accountKey} onChange={(e) => setAccountKey(e.target.value)}>
                <option value="">Select authorized wallet…</option>
                {accounts.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label} · {o.address.slice(0, 8)}…
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 11, color: '#000', display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ width: 60 }}>Side</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: side ? ACTION_COLOR[analysis?.action ?? 'HOLD'] : '#666' }}>
                {side ? (side === 'buy' ? 'BUY (pay USDC)' : 'SELL (receive USDC)') : 'HOLD — no trade'}
              </span>
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
              <span style={{ width: 60 }}>{side === 'buy' ? 'USDC' : 'Tokens'}</span>
              <input
                style={field()}
                type="number"
                min={0}
                placeholder={side === 'buy' ? 'Amount in USDC (native)' : 'Amount in tokens'}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>

            {quoteOut && (
              <div style={{ fontSize: 11, color: '#060' }}>Quoted out: ≈ {quoteOut}</div>
            )}
            {error && (
              <div style={{ fontSize: 10, color: '#a00', border: '1px inset', borderColor: '#808080 #fff #fff #808080', background: '#fff', padding: '4px 8px', wordBreak: 'break-word' }}>
                {error}
              </div>
            )}
            {result && (
              <div style={{ fontSize: 10, border: '1px inset', borderColor: '#808080 #fff #fff #808080', background: '#fff', padding: '4px 8px', wordBreak: 'break-all', color: result.status === 'reverted' ? '#a00' : '#060' }}>
                {result.status === 'pending' && '⏳ Broadcasting…'}
                {result.status === 'success' && '✅ On-chain success.'}
                {result.status === 'reverted' && '❌ Transaction reverted.'}
                <br />
                <a href={`${EXPLORER_TX}${result.hash}`} target="_blank" rel="noreferrer" style={{ color: '#0000ee' }}>
                  {result.hash}
                </a>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button
                style={btnStyle(true)}
                disabled={busy || !side || !accountKey}
                onClick={() => void doExecute()}
              >
                {busy ? 'Working…' : 'Quote → Swap → Confirm'}
              </button>
            </div>
            <div style={{ fontSize: 9, color: '#555' }}>
              Private key stays in the main process. Agent proposes; you dispose.
              Quote includes pool + hook fees; min-out uses 2.5% slippage.
              {side === 'sell' && ' Sell auto-grants Permit2 + token approvals.'}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TradeRun
