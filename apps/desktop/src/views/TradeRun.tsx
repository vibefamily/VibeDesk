/**
 * TradeRun - the Agent Trade Run closed loop (crypto focus, hackathon).
 *
 * One window that tells the whole story:
 *
 *   Chat "buy 0.01 BTC" -> agent replies -> the intent is parsed and a
 *   real Uniswap v4 swap runs on Arc through the main process -> balances
 *   update live.
 *
 * Layout:
 *   Left  : Binance price chart (token switch) + news/twitter feed
 *   Right : authorized wallet (address, token + USDC balances, Auto-run)
 *           execution params & risk checks, and the AI chat panel.
 * The private key never leaves the main process.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAgentStore } from '../stores/agentStore'
import { useWalletStore } from '../stores/walletStore'
import PriceChart from '../components/PriceChart'
import AgentConfigPanel from '../components/AgentConfigPanel'
import type { InfoItem } from '@vibe/shared'

const EXPLORER_TX = 'https://testnet.arcscan.app/tx/'

/**
 * Demo token on Arc testnet (Minara, graduated). BTC/ETH chart pairs come
 * from Binance; on-chain they map to this Arc asset for the hackathon demo
 * (real asset mapping lands with mainnet support).
 */
const DEMO_ARC_TOKEN = '0xe2cfd2893ad90e8a5b4f87c5cad22d150b1e12a0'

interface CryptoAsset {
  symbol: string
  name: string
  pair: string
  arcToken: string
}

const CRYPTO_ASSETS: CryptoAsset[] = [
  { symbol: 'BTC', name: 'Bitcoin', pair: 'BTCUSDT', arcToken: DEMO_ARC_TOKEN },
  { symbol: 'ETH', name: 'Ethereum', pair: 'ETHUSDT', arcToken: DEMO_ARC_TOKEN },
]

interface RiskSettings {
  maxOrderValue: number // USDC, 0 = unlimited
  maxDailyVolume: number // USDC, 0 = unlimited
  maxDrawdownPct: number // 0 = disabled
  requireHumanApproval: boolean
}

const DEFAULT_RISK: RiskSettings = {
  maxOrderValue: 0,
  maxDailyVolume: 0,
  maxDrawdownPct: 0,
  requireHumanApproval: true,
}

const RISK_KEY = 'vibedesk.trade-risk'

function loadRisk(): RiskSettings {
  try {
    const raw = localStorage.getItem(RISK_KEY)
    if (!raw) return DEFAULT_RISK
    return { ...DEFAULT_RISK, ...(JSON.parse(raw) as Partial<RiskSettings>) }
  } catch {
    return DEFAULT_RISK
  }
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

interface ChatMsg {
  role: 'user' | 'agent' | 'system'
  content: string
  at: number
}

/** Parse "buy 0.01 btc" / "sell 2 eth" from a chat line. */
function parseIntent(text: string): { side: 'buy' | 'sell'; amount: number; symbol: string } | null {
  const m = /^(?:buy|sell)\s+([\d.]+)\s*(btc|eth)\b/i.exec(text.trim())
  if (!m) return null
  const amount = Number(m[1])
  if (!Number.isFinite(amount) || amount <= 0) return null
  return { side: (m[0].toLowerCase().startsWith('buy') ? 'buy' : 'sell'), amount, symbol: m[2]!.toUpperCase() }
}

const TradeRun: React.FC = () => {
  const agents = useAgentStore((s) => s.agents)
  const refresh = useAgentStore((s) => s.refresh)
  const chat = useAgentStore((s) => s.chat)
  const wallets = useWalletStore((s) => s.wallets)
  const authorized = useWalletStore((s) => s.authorized)
  const refreshWallets = useWalletStore((s) => s.refresh)

  const [agentId, setAgentId] = useState('')
  const selected = agents.find((a) => a.id === agentId) ?? agents[0]
  const [showConfig, setShowConfig] = useState(false)

  // --- Left: chart + feed ---
  const [asset, setAsset] = useState<CryptoAsset>(CRYPTO_ASSETS[0]!)
  const [candles, setCandles] = useState<{ ts: number; price: number }[]>([])
  const [chartError, setChartError] = useState<string | null>(null)
  const [feedTab, setFeedTab] = useState<'news' | 'tweet'>('news')
  const [feedItems, setFeedItems] = useState<InfoItem[]>([])

  // --- Right: wallet + execution ---
  const [accountKey, setAccountKey] = useState('')
  const [autoRun, setAutoRun] = useState(false)
  const [arcToken, setArcToken] = useState(DEMO_ARC_TOKEN)
  const [amount, setAmount] = useState('')
  const [balances, setBalances] = useState<{ usdc: string; token: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ hash: string; status: 'pending' | 'success' | 'reverted' } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [risk, setRisk] = useState<RiskSettings>(loadRisk)
  const [showRisk, setShowRisk] = useState(false)

  // --- Chat ---
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([
    { role: 'system', content: 'Ask me to trade: e.g. "buy 0.01 BTC" or "sell 0.5 ETH".', at: Date.now() },
  ])
  const [chatInput, setChatInput] = useState('')
  const [sending, setSending] = useState(false)
  const sendingRef = useRef(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // --- Derived accounts ---
  const accounts = useMemo(
    () =>
      wallets
        .flatMap((w) => {
          if (w.kind === 'hd' && w.accounts && w.accounts.length > 0) {
            return w.accounts.map((a) => ({
              key: `${w.id}:${a.index}`,
              label: `${w.name} #${a.index + 1}`,
              address: a.address,
            }))
          }
          return [{ key: w.id, label: w.name, address: w.address }]
        })
        .filter((o) => authorized.includes(o.key)),
    [wallets, authorized],
  )

  const selectedAccount = accounts.find((a) => a.key === accountKey) ?? accounts[0]

  useEffect(() => {
    void refreshWallets()
  }, [refreshWallets])

  // --- Chart: Binance 1m candles for the selected asset ---
  const loadCandles = useCallback(async (): Promise<void> => {
    try {
      const res = await window.vibeAPI.market.candles({
        symbol: asset.pair,
        timeframe: '1m',
        limit: 120,
      })
      const pts = res
        .filter((c) => c && typeof c.close === 'number')
        .map((c) => ({ ts: Math.floor(c.timestamp / 1000), price: c.close }))
      setCandles(pts)
      setChartError(null)
    } catch (e) {
      setChartError((e as Error).message)
    }
  }, [asset.pair])

  useEffect(() => {
    void loadCandles()
    const t = setInterval(() => void loadCandles(), 30_000)
    return () => clearInterval(t)
  }, [loadCandles])

  // --- Feed: news / tweet items from Info Center ---
  const loadFeed = useCallback(async (): Promise<void> => {
    try {
      const state = await window.vibeAPI.info.getState()
      setFeedItems(state.items.slice(0, 12))
    } catch {
      // feed is best-effort
    }
  }, [])

  useEffect(() => {
    void loadFeed()
    const t = setInterval(() => void loadFeed(), 60_000)
    return () => clearInterval(t)
  }, [loadFeed])

  // --- Balances for the selected wallet + asset ---
  const loadBalances = useCallback(async (): Promise<void> => {
    if (!selectedAccount) {
      setBalances(null)
      return
    }
    const [walletId, indexStr] = selectedAccount.key.includes(':')
      ? selectedAccount.key.split(':')
      : [selectedAccount.key, undefined]
    try {
      const res = await window.vibeAPI.arc.balances({
        walletId,
        index: indexStr === undefined ? undefined : Number(indexStr),
        token: arcToken,
      })
      setBalances({ usdc: res.nativeUsdc, token: res.token })
    } catch (e) {
      setBalances(null)
      setError((e as Error).message)
    }
  }, [selectedAccount, arcToken])

  useEffect(() => {
    void loadBalances()
    const t = setInterval(() => void loadBalances(), 15_000)
    return () => clearInterval(t)
  }, [loadBalances])

  // --- Risk settings persistence ---
  const saveRisk = (next: RiskSettings) => {
    setRisk(next)
    try {
      localStorage.setItem(RISK_KEY, JSON.stringify(next))
    } catch {
      // localStorage unavailable - in-memory only
    }
  }

  // --- Execution pipeline (chat intent or manual params) ---
  const doExecute = async (
    side: 'buy' | 'sell',
    tokenAddr: string,
    amt: number,
  ): Promise<boolean> => {
    const account = selectedAccount
    if (!account) {
      setError('No authorized wallet available - grant one in Agent settings first.')
      return false
    }
    const maxOrder = risk.maxOrderValue
    if (maxOrder > 0 && amt > maxOrder) {
      setError(`Order ${amt} USDC exceeds max order value (${maxOrder}). Raise the limit in Risk settings or lower the amount.`)
      return false
    }
    if (risk.requireHumanApproval) {
      const ok = window.confirm(
        `Execute ${side.toUpperCase()} ${amt} of token on Arc testnet from ${account.address.slice(0, 8)}…?`,
      )
      if (!ok) return false
    }

    const [walletId, indexStr] = account.key.includes(':')
      ? account.key.split(':')
      : [account.key, undefined]
    const index = indexStr === undefined ? undefined : Number(indexStr)

    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const scale = 10 ** 18
      const amountIn = (BigInt(Math.round(amt * scale))).toString()
      const q = await window.vibeAPI.arc.quote({
        token: tokenAddr,
        zeroForOne: side === 'buy',
        amountIn,
      })
      const dec = q.decimals
      const minOut = (BigInt(q.amountOut) * 9750n) / 10000n
      const { hash } = await window.vibeAPI.arc.swap({
        walletId,
        index,
        token: tokenAddr,
        zeroForOne: side === 'buy',
        amountIn,
        amountOutMinimum: minOut.toString(),
      })
      setResult({ hash, status: 'pending' })
      const receipt = await window.vibeAPI.arc.waitReceipt(hash)
      setResult({ hash, status: receipt.status })
      const expected = side === 'buy'
        ? `${(Number(q.amountOut) / 10 ** dec).toPrecision(6)} tokens`
        : `${(Number(q.amountOut) / 10 ** dec).toPrecision(6)} USDC`
      if (receipt.status === 'success') {
        void loadBalances()
        return true
      } else {
        setError(`Transaction reverted. Expected out: ${expected}`)
        return false
      }
    } catch (e) {
      setError((e as Error).message)
      return false
    } finally {
      setBusy(false)
    }
  }

  // --- Chat: send to the agent; a buy/sell intent also triggers execution ---
  const send = async (): Promise<void> => {
    const text = chatInput.trim()
    if (!text || sendingRef.current || !selected) return
    sendingRef.current = true
    setSending(true)
    setChatInput('')
    if (inputRef.current) inputRef.current.value = ''
    const userMsg: ChatMsg = { role: 'user', content: text, at: Date.now() }
    setChatMsgs((prev) => [...prev, userMsg])

    const intent = parseIntent(text)
    let execMsg: ChatMsg | null = null
    if (intent) {
      const target = CRYPTO_ASSETS.find((a) => a.symbol === intent.symbol)
      if (!target) {
        execMsg = { role: 'system', content: `Unknown asset ${intent.symbol}.`, at: Date.now() }
      } else if (!autoRun) {
        execMsg = {
          role: 'system',
          content: `Intent: ${intent.side.toUpperCase()} ${intent.amount} ${intent.symbol}. Turn on Auto-run to execute automatically, or use the Execute button.`,
          at: Date.now(),
        }
      }
    }
    if (execMsg) setChatMsgs((prev) => [...prev, execMsg!])

    // Stream the agent's reply.
    const t0 = Date.now()
    const live = useAgentStore.getState().chat
    try {
      await live(selected.id, text)
      const final = useAgentStore.getState().agents.find((a) => a.id === selected.id)
      const reply = final?.lastMessage
      if (reply) {
        setChatMsgs((prev) => [...prev, { role: 'agent', content: reply, at: Date.now() }])
      }
    } catch {
      setChatMsgs((prev) => [
        ...prev,
        { role: 'system', content: 'Agent request failed (check your AI provider key).', at: Date.now() },
      ])
    }

    // Execute the parsed intent automatically when Auto-run is on.
    if (intent && autoRun) {
      const target = CRYPTO_ASSETS.find((a) => a.symbol === intent.symbol)
      if (target) {
        const ok = await doExecute(intent.side, target.arcToken, intent.amount)
        setChatMsgs((prev) => [
          ...prev,
          ok
            ? { role: 'system', content: `✅ Executed ${intent.side} ${intent.amount} ${intent.symbol} on Arc testnet.`, at: Date.now() }
            : { role: 'system', content: `❌ Execution failed for ${intent.symbol} (see error above).`, at: Date.now() },
        ])
      }
    }
    void (t0 && undefined)
    sendingRef.current = false
    setSending(false)
  }

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMsgs])

  const feedTabItems = feedItems.filter((i) => i.kind === feedTab)

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
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 700, color: '#000' }}>Agent Trade</span>
        <select
          style={{ ...field(0), maxWidth: 200 }}
          value={selected?.id ?? ''}
          disabled
          title="This agent is bound to this window. Create a new agent for a different setup."
        >
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <button style={btnStyle()} onClick={() => void refresh()} disabled={!selected}>
          Refresh
        </button>
        <button
          style={{ ...btnStyle(), fontWeight: showRisk ? 700 : 400 }}
          onClick={() => setShowRisk((v) => !v)}
        >
          Risk settings
        </button>
        <button
          style={{ ...btnStyle(), fontWeight: showConfig ? 700 : 400 }}
          onClick={() => setShowConfig((v) => !v)}
          disabled={!selected}
        >
          Agent settings
        </button>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: '#333' }}>
          grants: {selected?.dataSources.length ?? 0} data · {selected?.walletAuths.length ?? 0} wallet
        </span>
        <span style={{ fontSize: 10, color: '#333' }}>
          Chain: Arc Testnet (5042002) · gas = native USDC
        </span>
      </div>

      {/* Risk panel */}
      {showRisk && (
        <div
          style={{
            borderBottom: '2px solid #808080',
            padding: 8,
            background: '#d4d0c8',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            alignItems: 'center',
            fontSize: 11,
            color: '#000',
          }}
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            Max order (USDC)
            <input
              type="number"
              min={0}
              style={{ ...field(0), width: 80 }}
              value={risk.maxOrderValue || ''}
              placeholder="∞"
              onChange={(e) => saveRisk({ ...risk, maxOrderValue: Number(e.target.value) || 0 })}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            Max daily (USDC)
            <input
              type="number"
              min={0}
              style={{ ...field(0), width: 80 }}
              value={risk.maxDailyVolume || ''}
              placeholder="∞"
              onChange={(e) => saveRisk({ ...risk, maxDailyVolume: Number(e.target.value) || 0 })}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            Max drawdown %
            <input
              type="number"
              min={0}
              style={{ ...field(0), width: 60 }}
              value={risk.maxDrawdownPct || ''}
              placeholder="0"
              onChange={(e) => saveRisk({ ...risk, maxDrawdownPct: Number(e.target.value) || 0 })}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              type="checkbox"
              checked={risk.requireHumanApproval}
              onChange={(e) => saveRisk({ ...risk, requireHumanApproval: e.target.checked })}
            />
            Require human approval
          </label>
          <span style={{ fontSize: 9, color: '#555' }}>
            0 = unlimited · limits are checked before every execution
          </span>
        </div>
      )}

      {showConfig && selected ? (
        <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
          <AgentConfigPanel
            agentId={selected.id}
            initialDataSources={selected.dataSources}
            initialWalletAuths={selected.walletAuths}
            onSaved={() => void refresh()}
          />
        </div>
      ) : (
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left: chart + feed */}
        <div
          style={{
            width: '46%',
            minWidth: 300,
            display: 'flex',
            flexDirection: 'column',
            padding: 8,
            borderRight: '2px solid #808080',
            gap: 8,
            overflow: 'auto',
          }}
        >
          {/* Token switch + chart */}
          <div style={{ border: '2px outset', borderColor: '#fff #808080 #808080 #fff', background: '#c0c0c0', padding: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#000' }}>Market</span>
              {CRYPTO_ASSETS.map((a) => (
                <button
                  key={a.symbol}
                  onClick={() => setAsset(a)}
                  style={{
                    ...btnStyle(),
                    padding: '2px 10px',
                    fontWeight: asset.symbol === a.symbol ? 700 : 400,
                    background: asset.symbol === a.symbol ? '#000080' : '#c0c0c0',
                    color: asset.symbol === a.symbol ? '#fff' : '#000',
                  }}
                >
                  {a.symbol}
                </button>
              ))}
              <span style={{ fontSize: 9, color: '#333' }}>Binance {asset.pair} · 1m</span>
            </div>
            {chartError && <div style={{ fontSize: 10, color: '#a00', marginBottom: 4 }}>{chartError}</div>}
            <PriceChart
              series={[{ provider: asset.pair, points: candles }]}
              height={190}
              providers={[asset.pair]}
            />
          </div>

          {/* Feed */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 140, border: '2px outset', borderColor: '#fff #808080 #808080 #fff', background: '#c0c0c0', padding: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#000' }}>Feed</span>
              {(['news', 'tweet'] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setFeedTab(k)}
                  style={{
                    fontSize: 10,
                    padding: '2px 8px',
                    border: '2px outset',
                    borderColor: feedTab === k ? '#808080 #fff #fff #808080' : '#fff #808080 #808080 #fff',
                    background: '#c0c0c0',
                    cursor: 'pointer',
                    fontWeight: feedTab === k ? 700 : 400,
                  }}
                >
                  {k}
                </button>
              ))}
            </div>
            <div style={{ flex: 1, overflow: 'auto', background: '#fff', border: '1px inset', borderColor: '#808080 #fff #fff #808080', padding: 4 }}>
              {feedTabItems.length === 0 ? (
                <div style={{ fontSize: 10, color: '#777', padding: 4 }}>
                  No {feedTab} items yet. Configure sources in Data Center → Sources.
                </div>
              ) : (
                feedTabItems.map((item) => (
                  <div key={item.id} style={{ fontSize: 10, color: '#000', padding: '3px 2px', borderBottom: '1px solid #e0e0e0' }}>
                    <a href={item.url} target="_blank" rel="noreferrer" style={{ color: '#0000ee', textDecoration: 'none' }}>
                      {item.title}
                    </a>
                    <div style={{ fontSize: 8, color: '#777' }}>
                      {item.sourceName} · {new Date(item.publishedAt).toLocaleTimeString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right: wallet + execution + chat */}
        <div style={{ flex: 1, padding: 8, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 320 }}>
          {/* Wallet block */}
          <div style={{ border: '2px outset', borderColor: '#fff #808080 #808080 #fff', background: '#c0c0c0', padding: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#000' }}>Wallet</span>
              <select
                style={{ ...field(0), maxWidth: 240 }}
                value={selectedAccount?.key ?? ''}
                onChange={(e) => setAccountKey(e.target.value)}
              >
                {accounts.length === 0 && <option value="">No authorized wallet…</option>}
                {accounts.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label} · {o.address.slice(0, 8)}…
                  </option>
                ))}
              </select>
              <label style={{ fontSize: 10, color: '#000', display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="checkbox" checked={autoRun} onChange={(e) => setAutoRun(e.target.checked)} />
                Auto-run
              </label>
              <button style={{ ...btnStyle(), padding: '2px 10px' }} onClick={() => void loadBalances()}>
                Refresh
              </button>
            </div>
            {selectedAccount && (
              <div style={{ fontSize: 10, color: '#333', marginBottom: 4 }}>
                {selectedAccount.address}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ border: '1px inset', borderColor: '#808080 #fff #fff #808080', background: '#fff', padding: '4px 10px', fontSize: 11 }}>
                <div style={{ fontSize: 9, color: '#555' }}>USDC (native)</div>
                <div style={{ fontWeight: 700, color: '#000' }}>{balances ? balances.usdc : '—'}</div>
              </div>
              <div style={{ border: '1px inset', borderColor: '#808080 #fff #fff #808080', background: '#fff', padding: '4px 10px', fontSize: 11 }}>
                <div style={{ fontSize: 9, color: '#555' }}>Token {asset.symbol}</div>
                <div style={{ fontWeight: 700, color: '#000' }}>{balances ? balances.token : '—'}</div>
              </div>
              <div style={{ alignSelf: 'center', fontSize: 9, color: '#555' }}>
                Arc testnet · auto-updates after each swap
              </div>
            </div>
          </div>

          {/* Execution params */}
          <div style={{ border: '2px outset', borderColor: '#fff #808080 #808080 #fff', background: '#c0c0c0', padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#000' }}>Execution — Uniswap v4 on Arc</div>
            <label style={{ fontSize: 11, color: '#000', display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ width: 70 }}>Asset</span>
              <select style={field()} value={asset.symbol} onChange={(e) => {
                const a = CRYPTO_ASSETS.find((x) => x.symbol === e.target.value)
                if (a) setAsset(a)
              }}>
                {CRYPTO_ASSETS.map((a) => (
                  <option key={a.symbol} value={a.symbol}>{a.symbol} — {a.name}</option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 11, color: '#000', display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ width: 70 }}>Token addr</span>
              <input style={field()} value={arcToken} onChange={(e) => setArcToken(e.target.value)} />
            </label>
            <label style={{ fontSize: 11, color: '#000', display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ width: 70 }}>Amount</span>
              <input style={field()} type="number" min={0} placeholder="in USDC (buy) or tokens (sell)" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <label style={{ fontSize: 11, color: '#000', display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ width: 70 }}>Side</span>
              <span style={{ fontSize: 11, color: '#666' }}>
                BUY pays USDC · SELL receives USDC (set via chat: "buy 0.01 BTC")
              </span>
            </label>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                style={{ ...btnStyle(true) }}
                disabled={busy || !selectedAccount || !Number(amount)}
                onClick={() => {
                  const a = Number(amount)
                  if (a > 0) void doExecute('buy', arcToken, a)
                }}
              >
                {busy ? 'Working…' : 'Buy (USDC)'}
              </button>
              <button
                style={{ ...btnStyle(true), color: '#a00000' }}
                disabled={busy || !selectedAccount || !Number(amount)}
                onClick={() => {
                  const a = Number(amount)
                  if (a > 0) void doExecute('sell', arcToken, a)
                }}
              >
                {busy ? 'Working…' : 'Sell (tokens)'}
              </button>
              {autoRun && <span style={{ fontSize: 9, color: '#060' }}>Auto-run on: chat intents execute directly</span>}
            </div>
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
            <div style={{ fontSize: 9, color: '#555' }}>
              Private key stays in the main process. Agent proposes; risk limits gate every execution.
            </div>
          </div>

          {/* Chat panel */}
          <div style={{ flex: 1, minHeight: 180, display: 'flex', flexDirection: 'column', border: '2px outset', borderColor: '#fff #808080 #808080 #fff', background: '#c0c0c0', padding: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#000', marginBottom: 6 }}>AI Chat — {selected?.name ?? 'agent'}</div>
            <div
              style={{
                flex: 1,
                overflow: 'auto',
                background: '#fff',
                border: '1px inset',
                borderColor: '#808080 #fff #fff #808080',
                padding: 6,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                minHeight: 0,
              }}
            >
              {chatMsgs.map((m, i) => (
                <div key={i} style={{ fontSize: 11, color: m.role === 'system' ? '#555' : '#000' }}>
                  {m.role === 'user' && <b style={{ color: '#000080' }}>You: </b>}
                  {m.role === 'agent' && <b style={{ color: '#006' }}>Agent: </b>}
                  {m.role === 'system' && <i>• </i>}
                  <span style={{ whiteSpace: 'pre-wrap' }}>{m.content}</span>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <input
                ref={inputRef}
                style={{ ...field(1), width: '100%' }}
                placeholder='Try "buy 0.01 BTC" or ask a question…'
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void send()
                  }
                }}
              />
              <button style={btnStyle(true)} onClick={() => void send()} disabled={sending || !selected}>
                {sending ? '…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  )
}

export default TradeRun
