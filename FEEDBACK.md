# Feedback: Uniswap v4 — from an AI trading agent integrator

**Project:** VibeDesk (`github.com/vibefamily/VibeDesk`) — a local-first trading agent OS.
**Integration:** Uniswap v4 swaps executed by AI agents on the **Arc network** (gas = native USDC), through the Minara-deployed v4 stack (Permit2, PoolManager, StateView, V4 Quoter, Universal Router).
**Code pointers:** `apps/desktop/electron/main/arc.ts` (quote/approve/swap flow), `apps/desktop/electron/main/arc/networks.ts` (network registry), `apps/desktop/src/views/TradeRun.tsx` (signal→execution pipeline), `apps/desktop/src/components/ArcSwapPanel.tsx` (manual swap dialog).

This document is our developer feedback to the Uniswap team, written from the perspective of an agent-first integrator building on v4 for the first time.

---

## What we built on v4

1. **Live quotes with full fee visibility** — `V4Quoter.quoteExactInputSingle(poolKey, zeroForOne, exactAmount, hookData)` returns `amountOut` + `gasEstimate`. We surface the quoted output (fees included) to the user *before* signing, which matters a lot for an agent-driven UX: the human sees exactly what the agent would get.
2. **Permit2 dual approval (sell path)** — our agent flow auto-grants two approvals when selling a token: `token.approve(PERMIT2)` (max uint256) and `Permit2.approve(token, ROUTER)` (max uint160, 30-day expiry). Buy path pays with native USDC via `msg.value`.
3. **Universal Router `execute`** with the `V4_SWAP` command — `SWAP_EXACT_IN_SINGLE` + `SETTLE` (payerIsUser on/off by direction) + `TAKE`, with `minHopPriceX36 = 0` and a 10-minute deadline.
4. **poolKey construction** — `(currency0=USDC-0x0, currency1=token, fee=2500, tickSpacing=25, hooks)` hashed with keccak to derive `poolId` where needed.

## What worked well

- **V4 Quoter** is genuinely agent-friendly: one call gives you a clean `(amountOut, gasEstimate)` tuple with fees included. It made the "quote before confirm" UX trivial.
- **Permit2 as a shared approval layer** is the right abstraction for agents that trade many tokens — a single approval contract keeps the agent's authorization surface small and auditable.
- **Native gas = USDC** on Arc makes the whole loop simpler for an agent: settlement currency and gas currency are the same.

## Friction points & suggestions

### 1. Hook fees are invisible to naive callers
The V4 Quoter includes hook fees in `amountOut`, but unless you read the hook itself you can't tell how much of the spread is fee vs. price. For agent transparency (and for "why did my quote move" UX), we'd love:
- a standardized `quoteExactInputSingle` extension or a `feeBreakdown` view on StateView-style lenses, so integrators can show `price impact vs. pool fee vs. hook fee` without reverse-engineering each hook.

### 2. Permit2 dual-approval friction for new agent developers
Requiring *both* `token.approve(PERMIT2)` *and* `Permit2.approve(token, ROUTER)` is easy to get wrong (wrong spender, wrong expiry, allowance race between two txs). Suggestions:
- ship an official "approval matrix" doc/table: for each action (swap, position, donate), exactly which approvals are needed, by whom, in what order;
- consider a single `Permit2.setApprovalForAll`-style convenience for routers (we're aware of the design reasons against; flagging the UX cost).

### 3. Read-only access split across PoolManager vs StateView
On the chain we integrated (Arc), the standard v4 read functions (`getSlot0`, `getLiquidity`) revert on PoolManager and live on a separate **StateView** contract. This is not obvious from the docs and cost us debugging time. A short "read paths" section in the docs (which lens to call for slot0/liquidity/quote on a given chain) would help integrators a lot.

### 4. Event signature drift between chains
We encountered a v4 deployment where the `Initialize` event used an extended signature (extra `tickSpacing`/`hooks` params) and the documented topic hash matched nothing on-chain. Integrating by raw event topics is fragile across chains; a canonical ABI registry per chain in the docs would prevent this.

### 5. `poolKey` typing friction
`currency0` being `address(0)` for native tokens is well-documented, but tooling (TypeScript SDKs, explorers) still chokes on `0x0` in places. A first-class "native currency" representation in the v4 SDK types would remove a whole class of bugs.

## Data points (Arc testnet, ~2026-09)

- Quote-to-broadcast round trip in our pipeline: **< 2 s** for a single-hop swap (Quoter → calldata → broadcast).
- Sell path adds 2 approval txs before the swap; with Permit2 already approved, the swap is a single tx.
- All flows verified end-to-end on-chain (see project commit history / Arcscan).

---

*We'd be happy to expand any of these points or run through the integration with the Uniswap team.*
