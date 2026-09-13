# 你的本地交易 Agent 操作系统（Your Local Agent Trading OS）

> *始于 ETH Global 2026（Build start from ETH Global 2026）*

> **账户（钱包或 CEX 密钥）+ 数据 + AI = Agent 驱动交易（Account (wallet or CEX key) + Data + AI = Agentic Trading）**

一款本地优先的桌面应用：你的 AI Agent 读取多源实时行情、分析新闻，并通过你**预先授权的钱包**执行真实链上交易——可逐笔确认，也可开启自动运行。你的钱包密钥始终以加密形式保存在本机；Agent 只能请求签名，永远无法读取密钥。**开箱即用**——Agent 运行时内置在应用里，无需自行安装或运行任何服务器。

---

## 01 · 安全账户（Safe Account）

**你的密钥，你做主。**

- **本地优先的钱包保险库** — 在本机管理多个钱包；助记词和私钥在本地生成，永不以明文展示
- **按钱包授权给 Agent** — 一键授予 Agent 访问指定钱包的权限，随时可撤销
- **密钥不可触及** — Agent 永远无法读取你的私钥或助记词；保险库仅在签名时于内存中解密，且只针对你已授权的钱包
- **进程隔离** — Agent 与钱包将运行在独立进程中；Agent 只能通过 IPC **请求签名**，永远无法读取你的密钥 [TODO: enhancement]

## 02 · AI

**真正干活的 Agent。**

- **多 Agent 设计** — 通用聊天 Agent、交易 Agent、新闻机器人并行运行，各自拥有独立的上下文、工具和记忆
- **基于 Pi 引擎** — 完整的 Agent 运行时，内置持久上下文与工具调用能力
- **可插拔 Skills** — 用数据源技能、策略技能，或 Agent 为你现场生成的技能来扩展任意 Agent（部分实现）

## 03 · 数据（Data）

**每一个价格。每一条信号。一个桌面。**

- **统一多源价格** — Hyperliquid、Binance、Robinhood 等在一个界面实时刷新
- **新闻与社交流** — 同一屏上同时关注价格与消息面
- **AI 驱动分析** — Agent 把原始价格与新闻标题转化为可执行的建议

---

## 功能亮点

- 🖥️ **React95 桌面** — 可拖拽窗口、任务栏、开始菜单、桌面快捷方式
- 👛 **本地钱包保险库** — 安全优先：HD 助记词 + 私钥，AES 加密，MetaMask 式交互（查看需输入密码），多账户；私钥永不离主进程
- 🤖 **多 Agent** — 规则模式确定性分析（零 API Key 可用）或 LLM 模式（兼容 OpenAI、DeepSeek、Ollama）；按 Agent 隔离上下文、Skills、数据源与钱包授权；支持定时运行
- 📊 **多源价格** — Robinhood、Yahoo、Hyperliquid、Binance 同屏展示，SQLite 支撑的历史时序图（分钟级 tick，多源叠加）
- ⛓️ **链上执行** — 在 Arc 测试网真实执行交易（Uniswap v4 池，gas = 原生 USDC）：报价 → 授权 → 签名 → 广播 → 回执，全部在主进程完成；测试网已验证，主网占位就绪（可在设置中切换）
- 🔄 **Agent 交易闭环** — 可视化完整链路：信号 → 意图 → 报价 → 授权 → 签名 → 广播 → 回执。Agent 提议，人来决策。

## 架构

参见 [`docs/architecture.svg`](docs/architecture.svg) — 三层结构（React95 渲染层 / Electron 主进程 / 链上），并高亮授权边界。

```
桌面壳 (React95)                主进程（密钥仅存于此）                    链上
┌────────────────────────┐  IPC ┌───────────────────────────────────────┐ 签名+  ┌─────────────┐
│ Data Center            │      │ Market Aggregator · SQLite 价格历史     │  广播    │ Arc         │
│  Markets · News ·      │◀────▶│   （分钟级 tick）                       │────────▶│  测试网      │
│   Sources              │      │ Agent Runtime（Pi 引擎）               │        │  (Uniswap   │
│ AI Agent               │      │   多 Agent · 每 Agent 独立上下文       │        │   v4 池)    │
│  General Chat · Trade  │      │   Skills 与工具（agent-plugins）       │        │  主网占位    │
│   Agent · Manager      │      │ Wallet Vault（AES · 内存密钥            │        └─────────────┘
│ Wallet Manager         │      │   · 持久化授权）                       │
│ Settings (模型/密钥)    │      │ Arc module（Quoter · Permit2 ·        │
└────────────────────────┘      │   Universal Router · networks）       │
                                └───────────────────────────────────────┘
```

## 快速开始

```bash
pnpm install
cd apps/desktop
pnpm dev          # 启动 Electron 应用
```

1. **Wallet Manager** — 创建 HD 钱包（或导入助记词 / 私钥）。解锁后将其授权给你要交易的 Agent。
2. **AI Agent** — 直接与默认 Agent 对话（规则模式无需密钥）。LLM 模式请在 设置 → AI 模型 中配置模型（兼容 OpenAI 端点或 Ollama）。
3. **Data Center** — Markets 页签展示多源实时价格；Trade Run 页签将 Agent 信号转换为执行流水线。
4. **在 Arc 测试网交易** — 选择一个已授权钱包，输入池代币，确认。报价、授权、签名、广播全部在主进程完成。

## License

MIT（见 LICENSE）。
