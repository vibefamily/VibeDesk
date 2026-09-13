# VibeDesk — Your Local Trading Agent OS

**Data + AI + Wallet = Auto Trading.** A local-first desktop application (Windows 95 aesthetic, Electron + React) where your AI agents read live multi-source market data, decide, and — with your confirmation — execute real on-chain trades. Your wallet, your AI, your data: nothing leaves your machine except signed transactions.

Built for the **ETHGlobal 2026** hackathon. Primary sponsor targets: **Arc (Circle)** — Agentic Economy & DeFi — and **Uniswap** (Stack Contribution). See `docs/ethglobal2026/` for the strategy docs.

---

## Highlights

- 🖥️ **React95 desktop** — draggable windows, taskbar, start menu, desktop shortcuts
- 📊 **Multi-source prices** — Robinhood, Yahoo, Hyperliquid, Binance in one view, with SQLite-backed historical time-series charts (1-minute ticks, multi-provider overlay)
- 🤖 **Multi-agent** — rule-mode deterministic analysis (works with zero API keys) or LLM mode (OpenAI-compatible, DeepSeek, Ollama); per-agent context, skills, data-source and wallet authorization; agents run on a schedule
- 👛 **Local wallet vault** — HD mnemonic + private keys, AES-encrypted, MetaMask-style (reveal requires password), multi-account; private keys never leave the main process
- 🦄 **On-chain execution** — real **Uniswap v4 swaps on Arc** (gas = native USDC) through the Minara-deployed Universal Router: V4 Quoter quotes → Permit2 approvals → local sign → broadcast → receipt
- 🔄 **Agent Trade Run** — the closed loop, visualized: signal → intent → quote → authorize → sign → broadcast → receipt. Agent proposes, human disposes.
- 🌐 **Dual-network Arc config** — testnet verified, mainnet placeholders ready (switch in Settings)

## Architecture

See [`docs/architecture.svg`](docs/architecture.svg) — three layers (React95 renderer / Electron main / onchain) with the auth boundary highlighted.

```
Renderer (React95)          Main process (secrets stay here)          Onchain
┌─────────────┐   IPC    ┌──────────────────────────────┐   sign+  ┌───────────┐
│ Data Center │ ◀──────▶ │ Market Aggregator · SQLite   │   broadcast │ Arc     │
│ AI Agent    │          │ Agent Manager (rule/LLM)     │ ─────────▶ │ Testnet  │
│ Wallet Mgr  │          │ Wallet Vault (AES, in-mem)   │            │ Mainnet  │
│ Settings    │          │ Arc module (Quoter/Permit2/  │            │ USDC     │
└─────────────┘          │  Router · networks.ts)       │            └───────────┘
                         └──────────────────────────────┘
```

## Quick start

```bash
pnpm install
cd apps/desktop
pnpm dev          # launches the Electron app
```

1. **Wallet Manager** — create an HD wallet (or import a mnemonic / private key). Unlock it and grant it to the agent you want to trade with.
2. **AI Agent** — chat with the default agent right away (rule mode works with no key). For LLM mode, configure a model in Settings → AI Models (OpenAI-compatible endpoint or Ollama).
3. **Data Center** — Markets tab shows live multi-source prices; Trade Run tab turns an agent signal into an execution pipeline.
4. **Trade on Arc** — pick an authorized wallet, enter a Minara/Uniswap v4 pool token, confirm. The swap quotes, approves, signs and broadcasts in the main process.

## Uniswap v4 integration

VibeDesk executes **Uniswap v4** swaps on Arc through the Minara deployment. Full integration notes and developer feedback: [`FEEDBACK.md`](FEEDBACK.md).

- **V4 Quoter** — `quoteExactInputSingle` for real-time quotes including pool + hook fees
- **Permit2** — automatic dual approval on the sell path: `token.approve(Permit2)` then `Permit2.approve(token, UniversalRouter)`
- **Universal Router** — `execute` with `V4_SWAP` command (`SWAP_EXACT_IN_SINGLE + SETTLE + TAKE` actions)
- Native USDC (address `0x0`) is the pool's `currency0`; Arc gas = USDC
- Code: `apps/desktop/electron/main/arc.ts`, `apps/desktop/electron/main/arc/networks.ts`, `apps/desktop/src/components/ArcSwapPanel.tsx`, `apps/desktop/src/views/TradeRun.tsx`

## License

MIT (see LICENSE).
