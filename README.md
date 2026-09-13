# Your Local Agent Trading OS

> *Build start from ETH Global 2026*

> **Account (wallet or CEX key) + Data + AI = Agentic Trading**

A local-first desktop app where your AI agents read live multi-source market data, analyze the news, and execute real on-chain trades through wallets you have pre-authorized — confirm each trade or let it auto-run. Your wallet keys stay encrypted on your machine; agents can only request signatures, never see keys. **Out of the box** — the agent runtime ships inside the app, no server to install or run yourself.

---

## 01 · Safe Account

**Your keys. Your rules.**

- **Local-first wallet vault** — manage multiple wallets on your own machine; seed phrases and private keys are generated locally and never shown in plain text
- **Per-wallet agent approval** — grant an agent access to a specific wallet with one click, revoke it anytime
- **Keys out of reach** — the agent never reads your private keys or seed phrases; the vault decrypts them only in memory at signing time, and only for wallets you have granted
- **Process isolation** — the agent and the wallet will live in separate processes; the agent can only *request signatures* over IPC and can never read your secrets [TODO: enhancement]

## 02 · AI

**Agents that actually do things.**

- **Multi-agent by design** — run a general chat agent, a trading agent and news bots side by side, each with its own context, tools and memory
- **Powered by the Pi engine** — a full agent runtime with persistent context and tool-calling built in
- **Pluggable skills** — extend any agent with data-source skills, strategy skills, or skills the agent builds for you on the fly *(partially implemented)*

## 03 · Data

**Every price. Every signal. One desk.**

- **Unified multi-source prices** — Hyperliquid, Binance, Robinhood and more in a single view, refreshed in real time
- **News & social feeds** — watch the price and the narrative at the same time, on one screen
- **AI-driven analysis** — agents turn raw prices and headlines into actionable recommendations

---

## Highlights

- 🖥️ **React95 desktop** — draggable windows, taskbar, start menu, desktop shortcuts
- 👛 **Local wallet vault** — security first: HD mnemonic + private keys, AES-encrypted, MetaMask-style (reveal requires password), multi-account; private keys never leave the main process
- 🤖 **Multi-agent** — rule-mode deterministic analysis (works with zero API keys) or LLM mode (OpenAI-compatible, DeepSeek, Ollama); per-agent context, skills, data-source and wallet authorization; agents run on a schedule
- 📊 **Multi-source prices** — Robinhood, Yahoo, Hyperliquid, Binance in one view, with SQLite-backed historical time-series charts (1-minute ticks, multi-provider overlay)
- ⛓️ **On-chain execution** — real swaps on the Arc testnet (Uniswap v4 pools, gas = native USDC): quote → approve → sign → broadcast → receipt, all in the main process; testnet verified, mainnet placeholders ready (switch in Settings)
- 🔄 **Agent Trade Run** — the closed loop, visualized: signal → intent → quote → authorize → sign → broadcast → receipt. Agent proposes, human disposes.

## Architecture

See [`docs/architecture.svg`](docs/architecture.svg) — three layers (React95 renderer / Electron main / onchain) with the auth boundary highlighted.

```
Desktop shell (React95)          Main process (secrets stay here)              Onchain
┌────────────────────────┐   IPC ┌───────────────────────────────────────┐  sign+  ┌─────────────┐
│ Data Center            │       │ Market Aggregator · SQLite price      │  broadcast │ Arc         │
│  Markets · News ·      │◀─────▶│   history (1-min ticks)               │──────────▶│  testnet    │
│   Sources              │       │ Agent Runtime (Pi engine)             │           │  (Uniswap   │
│ AI Agent               │       │   multi-agent · per-agent context     │           │   v4 pools) │
│  General Chat · Trade  │       │   skills & tools (agent-plugins)      │           │  mainnet    │
│   Agent · Manager      │       │ Wallet Vault (AES · in-memory keys    │           │  placeholders│
│ Wallet Manager         │       │   · persisted grants)                 │           └─────────────┘
│ Settings (models/keys) │       │ Arc module (Quoter · Permit2 ·        │
└────────────────────────┘       │   Universal Router · networks)        │
                                 └───────────────────────────────────────┘
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
4. **Trade on Arc testnet** — pick an authorized wallet, enter a pool token, confirm. The swap quotes, approves, signs and broadcasts in the main process.

## License

MIT (see LICENSE).
