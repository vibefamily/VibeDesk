/**
 * Agent IPC handlers for the Electron main process.
 *
 * Owns the AgentManager (multi-agent lifecycle), the main-process data
 * sources it queries, and the read-only wallet access bridge. Agent
 * events are forwarded to the renderer over 'agent:event'.
 */

import { ipcMain, webContents } from 'electron'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { AgentManager, OpenAICompatibleProvider } from '@vibe/agent-plugins'
import type { OpenAIConfig } from '@vibe/agent-plugins'
import type { LlmConfigFile, LlmProviderConfig, TradeExecutor } from '@vibe/agent-plugins'
import type { MarketDataAggregator } from '@vibe/core'
import type { VaultWalletManager } from '@vibe/core/wallet'
import { getMarketAggregator } from './market'
import type { InfoManager } from './info'
import {
  arcQuote,
  arcSwap,
  arcBalances,
  arcWaitReceipt,
  arcExplorerTx,
} from './arc'

/**
 * Demo token on Arc testnet standing in for BTC/ETH until mainnet asset
 * mapping lands (Minara's graduated token).
 */
const DEMO_ARC_TOKEN = '0xe2cfd2893ad90e8a5b4f87c5cad22d150b1e12a0' as `0x${string}`

let agentManager: AgentManager | null = null
let agentConfigPath = ''

function sanitizeTemplate(t: { id: string; name: string; description: string; icon: string; defaultIntervalMs: number; defaultSymbols: string[]; tools: string[] }): Record<string, unknown> {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    icon: t.icon,
    defaultIntervalMs: t.defaultIntervalMs,
    defaultSymbols: t.defaultSymbols,
    tools: t.tools,
  }
}

function loadAgentConfig(): LlmConfigFile | null {
  try {
    if (!existsSync(agentConfigPath)) return null
    const raw = JSON.parse(readFileSync(agentConfigPath, 'utf8')) as
      | LlmConfigFile
      | OpenAIConfig
    // New multi-provider format.
    if (Array.isArray((raw as LlmConfigFile).providers)) {
      return raw as LlmConfigFile
    }
    // Legacy single-config format: migrate to one provider.
    const legacy = raw as OpenAIConfig
    if (!legacy.baseUrl || !legacy.apiKey || !legacy.model) return null
    return {
      providers: [
        {
          id: 'default',
          name: 'Default',
          api: 'openai-completions',
          baseUrl: legacy.baseUrl,
          apiKey: legacy.apiKey,
          models: [legacy.model],
          model: legacy.model,
          active: true,
        },
      ],
    }
  } catch {
    return null
  }
}

function saveAgentConfig(file: LlmConfigFile | null): void {
  try {
    if (!file || !Array.isArray(file.providers) || file.providers.length === 0) {
      if (existsSync(agentConfigPath)) {
        writeFileSync(agentConfigPath, '', { encoding: 'utf8', mode: 0o600 })
      }
      return
    }
    mkdirSync(dirname(agentConfigPath), { recursive: true })
    writeFileSync(agentConfigPath, JSON.stringify(file, null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    })
  } catch (err) {
    console.error('[agents] failed to persist LLM config:', err)
  }
}

/** Wire up the agent IPC surface. */
export async function setupAgentIpc(
  options: {
    getWallet: () => VaultWalletManager
    configPath: string
    /** Directory to persist agent instances (M5). */
    agentsDir: string
    /** Directory for the pi agent harness (settings + session artifacts). */
    piAgentDir: string
    /** Enabled tool-set skill ids fed to pi customTools (M7-3).
     *  Omit to enable every built-in tool-set. */
    enabledToolsets?: string[]
    /** Resolve the Info Center manager (M3); enables the read_information tool. */
    infoStore?: () => InfoManager | null
  },
): Promise<void> {
  agentConfigPath = options.configPath

  // Main-process data sources: the agents query live multi-source prices
  // through the shared aggregator (same instance the market bridge uses,
  // so the UI and the agents always see the same prices).
  const market: MarketDataAggregator = await getMarketAggregator()

  const resolveInfo = options.infoStore
  // Bridge that lets the trade-execute skill sign real Arc swaps with the
  // vault's in-memory authorized key. Private keys never leave the main
  // process; the agent only ever sees tx hashes and balances.
  // Resolve the agent-supplied wallet reference (an id, or a wallet name
  // the LLM may have picked up from list_authorized_wallets) to a signing
  // key from the vault's in-memory authorized cache.
  const resolveWalletKey = (
    vault: VaultWalletManager,
    walletId: string,
    index?: number,
  ): { key: string; walletId: string; index: number | undefined } | null => {
    let key = vault.getAuthorizedKey(walletId, index)
    if (key) return { key, walletId, index }
    // Fallback: match by wallet name across every authorized grant.
    for (const grant of vault.listAuthorized()) {
      const [wid = '', idxStr = ''] = grant.split(':')
      const meta = vault.getWallet(wid)
      if (meta && meta.name === walletId) {
        const i = idxStr === '' ? undefined : Number(idxStr)
        const k = vault.getAuthorizedKey(wid, i)
        if (k) return { key: k, walletId: wid, index: i }
      }
    }
    return null
  }
  const tradeExecutor: TradeExecutor = {
    resolveToken: async (symbol) => {
      const s = String(symbol).toUpperCase()
      if (s === 'BTC' || s === 'ETH') return DEMO_ARC_TOKEN
      if (/^0x[a-fA-F0-9]{40}$/.test(s)) return s.toLowerCase() as `0x${string}`
      throw new Error(`Unknown token: ${symbol}`)
    },
    getQuote: async (token, amountIn, buy) => {
      const q = await arcQuote({
        token: token as `0x${string}`,
        zeroForOne: buy,
        amountIn: BigInt(amountIn),
      })
      const price =
        (Number(q.amountOut) / 10 ** q.decimals) / (Number(amountIn) / 10 ** 18)
      return { amountOut: q.amountOut.toString(), decimals: q.decimals, price: price.toFixed(6) }
    },
    executeSwap: async ({ walletId, index, token, amountIn, buy, amountOutMinimum }) => {
      const vault = options.getWallet()
      const resolved = resolveWalletKey(vault, walletId, index)
      if (!resolved) {
        throw new Error(
          'Wallet is not unlocked/authorized for trading - unlock the vault and grant this wallet in Wallet Manager',
        )
      }
      const { hash } = await arcSwap({
        privateKey: resolved.key as `0x${string}`,
        token: token as `0x${string}`,
        zeroForOne: buy,
        amountIn: BigInt(amountIn),
        amountOutMinimum: BigInt(amountOutMinimum),
      })
      return { hash, explorerUrl: arcExplorerTx(hash) }
    },
    waitReceipt: async (hash) => {
      const receipt = await arcWaitReceipt(hash)
      return { status: receipt.status, explorerUrl: arcExplorerTx(hash) }
    },
    getBalances: async (walletId, index, token) => {
      // Balances are public chain data: resolve the address from wallet
      // metadata (no unlock needed), so the agent can read balances even
      // while the vault is locked. Signing still requires unlock+auth.
      const vault = options.getWallet()
      const wallet = vault.getWallet(walletId)
      if (!wallet) throw new Error('Wallet not found')
      let address: `0x${string}`
      if (wallet.kind === 'hd') {
        const acc = (wallet.accounts ?? []).find(
          (a) => String(a.index) === String(index ?? 0),
        )
        if (!acc) throw new Error('HD account not found')
        address = acc.address as `0x${string}`
      } else {
        address = wallet.address as `0x${string}`
      }
      return arcBalances(address, token as `0x${string}`)
    },
  }
  agentManager = new AgentManager({
    market,
    agentsDir: options.agentsDir,
    piAgentDir: options.piAgentDir,
    enabledToolsets: options.enabledToolsets,
    tradeExecutor,
    ...(resolveInfo
      ? {
          infoStore: {
            search: (q) => resolveInfo()?.search(q) ?? Promise.resolve([]),
          },
        }
      : {}),
    walletAccess: {
      listAuthorizedWallets: () => {
        const vault = options.getWallet()
        // Use the persisted grant list (not the in-memory key cache) so
        // the agent can see which wallets the user granted even while the
        // vault is locked. Signing still requires unlock via
        // resolveWalletKey -> getAuthorizedKey.
        return vault
          .listAuthorizedGrants()
          .map((key) => {
            const [walletId = '', indexStr = ''] = key.split(':')
            if (!walletId) return null
            const wallet = vault.getWallet(walletId)
            if (!wallet) return null
            if (wallet.kind === 'hd' && indexStr !== '') {
              const acc = wallet.accounts?.find(
                (a) => String(a.index) === indexStr,
              )
              return acc
                ? { id: key, address: acc.address, name: `${wallet.name ?? walletId} #${indexStr}` }
                : null
            }
            return { id: key, address: wallet.address, name: wallet.name ?? walletId }
          })
          .filter((w): w is { id: string; address: string; name: string } => w !== null)
      },
    },
  })

  // Restore the persisted LLM providers (one active), if any. Saving it
  // back also migrates a legacy single-config file to the new format.
  const saved = loadAgentConfig()
  if (saved) {
    agentManager.setProviders(saved)
    saveAgentConfig(saved)
  }

  // Restore persisted agent instances (config, message history, timers).
  agentManager.restoreAll()

  // Seed the two default desktop agents (idempotent): Trade Agent and
  // Chat Agent. They power the "Trade Agent" / "Chat Agent" shortcuts on
  // the home desktop (order: wallet, data, trade, chat). If an agent of
  // the same template already exists (e.g. user's own General Chat),
  // pin its shortcut instead of creating a duplicate.
  const ensureDesktopAgent = (templateId: string, fallbackName: string) => {
    if (!agentManager) return
    const existing = agentManager.list().find((a) => a.templateId === templateId)
    if (existing) {
      if (!existing.desktopIcon) agentManager.setDesktopIcon(existing.id, true)
      // Trade Agent ships with the trade-execute skill enabled so it can
      // act on chat intents; other agents opt in via Skills.
      if (templateId === 'stock-analyst' && !(existing.skills ?? []).includes('trade-execute')) {
        agentManager.setSkills(existing.id, [...(existing.skills ?? []), 'trade-execute'])
      }
      return
    }
    agentManager.create(templateId, {
      name: fallbackName,
      symbols: templateId === 'stock-analyst' ? ['TSLA', 'NVDA'] : undefined,
      desktopIcon: true,
      skills: templateId === 'stock-analyst' ? ['trade-execute'] : undefined,
    })
  }
  ensureDesktopAgent('stock-analyst', 'Trade Agent')
  ensureDesktopAgent('general-chat', 'Chat Agent')

  ipcMain.handle('agent:listDataSources', () => {
    return market.listProviders().map((p) => p.id)
  })

  ipcMain.handle('agent:setDataSourceAuth', (_e, args: { id: string; dataSources: string[] }) => {
    agentManager!.setDataSourceAuth(args.id, args.dataSources ?? [])
    return agentManager!.get(args.id)
  })

  ipcMain.handle('agent:setWalletAuth', (_e, args: { id: string; walletAuths: string[] }) => {
    agentManager!.setWalletAuth(args.id, args.walletAuths ?? [])
    return agentManager!.get(args.id)
  })

  ipcMain.handle('agent:setSkills', (_e, args: { id: string; skills: string[] }) => {
    agentManager!.setSkills(args.id, args.skills ?? [])
    return agentManager!.get(args.id)
  })

  // Built-in skills catalog (global install/uninstall lands later).
  // Named skills:catalog because skills:list already belongs to the
  // data-source skill manager in skills.ts - registering it twice here
  // made setupAgentIpc throw and killed every agent: handler.
  ipcMain.handle('skills:catalog', () => {
    return [
      {
        id: 'trade-execute',
        name: 'Trade Execute',
        description:
          'Grants the agent buy/sell execution on Arc: swap quotes, real swaps and balance reads through the authorized wallets.',
        icon: '⚡',
      },
      {
        id: 'market',
        name: 'Market Data',
        description:
          'Live multi-source prices, candles and order books (Hyperliquid, Robinhood, Binance, Yahoo).',
        icon: '📊',
      },
      {
        id: 'wallet-read',
        name: 'Wallet Read',
        description:
          'Lets the agent see the wallet addresses the user authorized (metadata only, no secrets).',
        icon: '👛',
      },
      {
        id: 'info',
        name: 'Information',
        description:
          'News feeds and the local Info Center so the agent can reason about headlines.',
        icon: '📰',
      },
    ]
  })

  // Fan agent events out to every renderer window.
  agentManager.onEvent((event) => {
    for (const wc of webContents.getAllWebContents()) {
      wc.send('agent:event', event)
    }
  })

  // --- IPC ---

  ipcMain.handle('agent:listTemplates', () => {
    return agentManager!.listTemplates().map(sanitizeTemplate)
  })

  ipcMain.handle('agent:list', () => agentManager!.list())
  ipcMain.handle('agent:getMode', () => agentManager!.getMode())

  ipcMain.handle(
    'agent:create',
    (_e, args: { templateId: string; name?: string; symbols?: string[]; desktopIcon?: boolean }) => {
      return agentManager!.create(args.templateId, {
        name: args.name,
        symbols: args.symbols,
        desktopIcon: args.desktopIcon,
      })
    },
  )

  ipcMain.handle('agent:start', (_e, args: { id: string }) => {
    agentManager!.start(args.id)
    return agentManager!.get(args.id)
  })

  ipcMain.handle('agent:stop', (_e, args: { id: string }) => {
    agentManager!.stop(args.id)
    return agentManager!.get(args.id)
  })

  ipcMain.handle('agent:setIntervalMs', (_e, args: { id: string; intervalMs: number }) => {
    agentManager!.setIntervalMs(args.id, args.intervalMs)
    return agentManager!.get(args.id)
  })

  ipcMain.handle('agent:remove', (_e, args: { id: string }) => {
    agentManager!.remove(args.id)
    return agentManager!.list()
  })

  ipcMain.handle('agent:clearMessages', (_e, args: { id: string }) => {
    return agentManager!.clearChat(args.id)
  })

  ipcMain.handle('agent:runOnce', async (_e, args: { id: string }) => {
    await agentManager!.runOnce(args.id)
    return agentManager!.get(args.id)
  })

  // --- Multi-provider LLM configuration ---

  /** Mask keys before they reach the renderer: key bytes never leave main. */
  const toProviderView = (p: LlmProviderConfig) => ({
    id: p.id,
    name: p.name,
    api: p.api,
    baseUrl: p.baseUrl,
    models: p.models,
    model: p.model,
    active: p.active,
    hasKey: p.apiKey.length > 0,
  })

  ipcMain.handle('agent:listProviders', () => agentManager!.listProviders().map(toProviderView))

  ipcMain.handle(
    'agent:saveProvider',
    (_e, input: {
      id?: string
      name: string
      api: LlmProviderConfig['api']
      baseUrl: string
      apiKey?: string
      models: string[]
      model: string
      active?: boolean
    }) => {
      const saved = agentManager!.saveProvider(input)
      saveAgentConfig({ providers: agentManager!.listProviders() })
      return toProviderView(saved)
    },
  )

  ipcMain.handle('agent:activateProvider', (_e, id: string) => {
    agentManager!.activateProvider(String(id))
    saveAgentConfig({ providers: agentManager!.listProviders() })
    return agentManager!.listProviders().map(toProviderView)
  })

  ipcMain.handle('agent:removeProvider', (_e, id: string) => {
    agentManager!.removeProvider(String(id))
    saveAgentConfig({ providers: agentManager!.listProviders() })
    return agentManager!.listProviders().map(toProviderView)
  })

  // Agent-level model override: this agent uses its own model, falling back
  // to the active provider's default when cleared.
  ipcMain.handle('agent:setAgentModel', (_e, args: { id: string; model: string }) => {
    agentManager!.setAgentModel(String(args.id), String(args.model ?? ''))
    return agentManager!.get(args.id)
  })

  ipcMain.handle(
    'agent:setLlmConfig',
    (_e, config: OpenAIConfig | null) => {
      agentManager!.setLlmConfig(config)
      saveAgentConfig({ providers: agentManager!.listProviders() })
      return { mode: agentManager!.getMode() }
    },
  )

  ipcMain.handle('agent:getLlmConfig', () => agentManager!.getLlmConfig())

  // Switch the active provider's default model only: keep the stored base
  // URL + API key untouched (the key is never sent back to the renderer).
  ipcMain.handle('agent:setLlmModel', (_e, model: string) => {
    agentManager!.setActiveModel(String(model).trim())
    saveAgentConfig({ providers: agentManager!.listProviders() })
    return agentManager!.getLlmConfig()
  })

  // --- Chat (real conversation, LLM mode) ---
  ipcMain.handle('agent:chat', async (_e, args: { id: string; text: string }) => {
    return agentManager!.chat(args.id, String(args.text).trim())
  })

  // --- Ollama support: list local models from http://127.0.0.1:11434 ---
  ipcMain.handle('agent:probeOllama', async () => {
    try {
      const res = await fetch('http://127.0.0.1:11434/api/tags', {
        signal: AbortSignal.timeout(3000),
      })
      if (!res.ok) return { ok: false, models: [], error: `Ollama HTTP ${res.status}` }
      const data = (await res.json()) as { models?: Array<{ name?: string }> }
      const models = (data.models ?? []).map((m) => m.name).filter(Boolean)
      return { ok: true, models, error: null }
    } catch (err) {
      return {
        ok: false,
        models: [],
        error: err instanceof Error ? err.message : String(err),
      }
    }
  })

  // --- Connection test for any OpenAI-compatible endpoint ---
  ipcMain.handle(
    'agent:testConnection',
    async (_e, config: OpenAIConfig) => {
      try {
        const provider = new OpenAICompatibleProvider(config)
        const reply = await provider.chatComplete({
          messages: [{ role: 'user', content: 'Reply with the single word: OK' }],
          tools: [],
          model: config.model,
          temperature: 0,
        })
        const text = (reply.content ?? '').slice(0, 60)
        return { ok: true, reply: text || 'connected' }
      } catch (err) {
        return { ok: false, reply: null, error: err instanceof Error ? err.message : String(err) }
      }
    },
  )
}
