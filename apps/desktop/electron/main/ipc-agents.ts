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
import { AgentManager } from '@vibe/agent-plugins'
import type { OpenAIConfig } from '@vibe/agent-plugins'
import { createDefaultDataSources } from '@vibe/data-sources'
import type { MarketDataAggregator } from '@vibe/core'
import type { VaultWalletManager } from '@vibe/core/wallet'

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

function loadAgentConfig(): OpenAIConfig | null {
  try {
    if (!existsSync(agentConfigPath)) return null
    const raw = JSON.parse(readFileSync(agentConfigPath, 'utf8')) as OpenAIConfig
    if (!raw.baseUrl || !raw.apiKey || !raw.model) return null
    return raw
  } catch {
    return null
  }
}

function saveAgentConfig(config: OpenAIConfig | null): void {
  try {
    if (!config) {
      if (existsSync(agentConfigPath)) {
        writeFileSync(agentConfigPath, '', { encoding: 'utf8', mode: 0o600 })
      }
      return
    }
    mkdirSync(dirname(agentConfigPath), { recursive: true })
    writeFileSync(agentConfigPath, JSON.stringify(config, null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    })
  } catch (err) {
    console.error('[agents] failed to persist LLM config:', err)
  }
}

/** Wire up the agent IPC surface. */
export async function setupAgentIpc(
  options: { getWallet: () => VaultWalletManager; configPath: string },
): Promise<void> {
  agentConfigPath = options.configPath

  // Main-process data sources: the agents query live multi-source prices
  // through their own aggregator (independent of the renderer's UI store).
  const dataSources = await createDefaultDataSources()
  const market: MarketDataAggregator = dataSources.aggregator

  agentManager = new AgentManager({
    market,
    walletAccess: {
      listAuthorizedWallets: () => {
        const vault = options.getWallet()
        return vault
          .listAuthorized()
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

  // Restore the persisted LLM config, if any.
  const saved = loadAgentConfig()
  if (saved) {
    agentManager.setLlmConfig(saved)
  }

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
    (_e, args: { templateId: string; name?: string; symbols?: string[] }) => {
      return agentManager!.create(args.templateId, {
        name: args.name,
        symbols: args.symbols,
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

  ipcMain.handle('agent:remove', (_e, args: { id: string }) => {
    agentManager!.remove(args.id)
    return agentManager!.list()
  })

  ipcMain.handle('agent:runOnce', async (_e, args: { id: string }) => {
    await agentManager!.runOnce(args.id)
    return agentManager!.get(args.id)
  })

  ipcMain.handle(
    'agent:setLlmConfig',
    (_e, config: OpenAIConfig | null) => {
      agentManager!.setLlmConfig(config)
      saveAgentConfig(config)
      return { mode: agentManager!.getMode() }
    },
  )

  ipcMain.handle('agent:getLlmConfig', () => agentManager!.getLlmConfig())
}
