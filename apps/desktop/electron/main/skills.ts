/**
 * Skills module (main process).
 *
 * A Skill is a configurable capability package, modeled after OpenClaw
 * skills: metadata + config schema + factories that wire real providers
 * or tool sets. Data-source skills can carry API keys (e.g. Binance
 * stocks); keys are persisted locally (0600) and only ever used in the
 * main process.
 *
 * MVP scope: built-in skills registry + per-skill config persistence +
 * connection test. A skill marketplace (install/download third-party
 * skills) is P2.
 */

import { ipcMain } from 'electron'
import { createHmac } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BinanceSpotProvider, HyperliquidProvider, RobinhoodProvider, YahooFinanceProvider } from '@vibe/data-sources'

export interface SkillConfigField {
  key: string
  label: string
  secret: boolean
  placeholder?: string
}

export interface SkillDefinition {
  id: string
  name: string
  description: string
  icon: string
  kind: 'data-source' | 'tool-set'
  authRequired: boolean
  configFields: SkillConfigField[]
  /** Data-source skills build a provider from saved config. */
  providerFactory?: (config: Record<string, string>) => unknown
}

export interface SkillView {
  id: string
  name: string
  description: string
  icon: string
  kind: SkillDefinition['kind']
  authRequired: boolean
  /** Which config keys are already set (values are masked). */
  configuredKeys: string[]
  configFields: SkillConfigField[]
}

/** Built-in skill registry. */
export const BUILTIN_SKILLS: SkillDefinition[] = [
  {
    id: 'market',
    name: 'Market Data',
    description: 'Multi-source price, candles & order book tools for agents (get_price, compare_prices…).',
    icon: '📈',
    kind: 'tool-set',
    authRequired: false,
    configFields: [],
  },
  {
    id: 'wallet-read',
    name: 'Wallet Read',
    description: 'Read-only access to authorized wallet accounts (balances/addresses, no signing).',
    icon: '👛',
    kind: 'tool-set',
    authRequired: false,
    configFields: [],
  },
  {
    id: 'info',
    name: 'Info Center',
    description: 'News & tweet feeds pulled by Info Center, searchable by agents.',
    icon: '📰',
    kind: 'tool-set',
    authRequired: false,
    configFields: [],
  },
  {
    id: 'robinhood',
    name: 'Robinhood',
    description: 'US equity quotes from the public Robinhood endpoint. No key required.',
    icon: '🏦',
    kind: 'data-source',
    authRequired: false,
    configFields: [],
    providerFactory: () => new RobinhoodProvider(),
  },
  {
    id: 'yahoo',
    name: 'Yahoo Finance',
    description: 'US equity quotes & candles from the public Yahoo chart API. No key required.',
    icon: '🔁',
    kind: 'data-source',
    authRequired: false,
    configFields: [],
    providerFactory: () => new YahooFinanceProvider(),
  },
  {
    id: 'hyperliquid',
    name: 'Hyperliquid',
    description: 'Perp futures from the public Hyperliquid Info API. No key required.',
    icon: '🦄',
    kind: 'data-source',
    authRequired: false,
    configFields: [],
    providerFactory: () => new HyperliquidProvider(),
  },
  {
    id: 'binance',
    name: 'Binance',
    description: 'Spot market data; stock symbols require a user API key. Keys are stored locally and never leave this machine.',
    icon: '🏛️',
    kind: 'data-source',
    authRequired: true,
    configFields: [
      { key: 'apiKey', label: 'API Key', secret: true, placeholder: '••••••••' },
      { key: 'apiSecret', label: 'API Secret', secret: true, placeholder: '••••••••' },
    ],
    providerFactory: (config) => new BinanceSpotProvider(config),
  },
]

export type SkillConfigMap = Record<string, Record<string, string>>

export class SkillManager {
  private readonly configPath: string
  private config: SkillConfigMap = {}

  constructor(configDir: string) {
    this.configPath = join(configDir, 'skills.json')
    try {
      if (existsSync(this.configPath)) {
        this.config = JSON.parse(readFileSync(this.configPath, 'utf8')) as SkillConfigMap
      }
    } catch {
      this.config = {}
    }
  }

  list(): SkillView[] {
    return BUILTIN_SKILLS.map((skill) => {
      const saved = this.config[skill.id] ?? {}
      return {
        id: skill.id,
        name: skill.name,
        description: skill.description,
        icon: skill.icon,
        kind: skill.kind,
        authRequired: skill.authRequired,
        configuredKeys: Object.keys(saved).filter((k) => saved[k] !== ''),
        configFields: skill.configFields,
      }
    })
  }

  getConfig(skillId: string): Record<string, string> {
    return this.config[skillId] ?? {}
  }

  saveConfig(skillId: string, values: Record<string, string>): SkillView[] {
    const skill = BUILTIN_SKILLS.find((s) => s.id === skillId)
    if (!skill) return this.list()
    const next: Record<string, string> = {}
    for (const field of skill.configFields) {
      const v = String(values[field.key] ?? '').trim()
      if (v) next[field.key] = v
    }
    this.config[skillId] = next
    try {
      mkdirSync(join(this.configPath, '..'), { recursive: true })
      writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), {
        encoding: 'utf8',
        mode: 0o600,
      })
    } catch (err) {
      console.error('[skills] failed to persist config:', err)
    }
    return this.list()
  }

  /** Provider configs to inject into the data-source assembly. */
  providerConfigs(): Record<string, Record<string, string>> {
    const out: Record<string, Record<string, string>> = {}
    for (const skill of BUILTIN_SKILLS) {
      if (skill.kind === 'data-source' && this.config[skill.id]) {
        out[skill.id] = this.config[skill.id]!
      }
    }
    return out
  }

  /** Verify credentials against the provider's API (binance: ping + account). */
  async testConnection(skillId: string, values: Record<string, string>): Promise<{ ok: boolean; message: string }> {
    const skill = BUILTIN_SKILLS.find((s) => s.id === skillId)
    if (!skill) return { ok: false, message: `Unknown skill: ${skillId}` }
    if (skill.kind === 'tool-set') {
      return { ok: true, message: `${skill.name} is a tool set provided by the agent engine (no external connection).` }
    }
    if (skillId === 'binance') {
      return testBinanceConnection(values)
    }
    // Public endpoints: build the provider and do a lightweight connect.
    try {
      const provider = skill.providerFactory?.(values) as { connect(): Promise<void>; disconnect(): Promise<void> } | undefined
      if (!provider) return { ok: false, message: 'No provider factory for this skill.' }
      await provider.connect()
      await provider.disconnect()
      return { ok: true, message: `${skill.name} public endpoint reachable.` }
    } catch (err) {
      return { ok: false, message: `Connection failed: ${(err as Error).message}` }
    }
  }
}

/** Binance connectivity check: public ping + authenticated account probe. */
async function testBinanceConnection(config: Record<string, string>): Promise<{ ok: boolean; message: string }> {
  try {
    const ping = await fetch('https://api.binance.com/api/v3/ping')
    if (!ping.ok) return { ok: false, message: `Public ping failed (HTTP ${ping.status}).` }
    const apiKey = config.apiKey ?? ''
    const apiSecret = config.apiSecret ?? ''
    if (!apiKey || !apiSecret) {
      return { ok: true, message: 'Public endpoint reachable. Save API key & secret to unlock stock data.' }
    }
    const timestamp = Date.now()
    const query = `recvWindow=5000&timestamp=${timestamp}`
    const signature = createHmac('sha256', apiSecret).update(query).digest('hex')
    const res = await fetch(`https://api.binance.com/api/v3/account?${query}&signature=${signature}`, {
      headers: { 'X-MBX-APIKEY': apiKey },
    })
    if (!res.ok) {
      return { ok: false, message: `Authenticated probe failed (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}` }
    }
    const body = (await res.json()) as { balances?: unknown[] }
    return { ok: true, message: `Authenticated OK (${body.balances?.length ?? 0} balances visible).` }
  } catch (err) {
    return { ok: false, message: `Connection failed: ${(err as Error).message}` }
  }
}

/** Wire the skills IPC surface. */
export function setupSkillsIpc(manager: SkillManager): void {
  ipcMain.handle('skills:list', () => manager.list())
  ipcMain.handle('skills:saveConfig', (_e, args: { skillId: string; config: Record<string, string> }) => {
    return { skills: manager.saveConfig(args.skillId, args.config ?? {}), requiresRestart: true }
  })
  ipcMain.handle('skills:testConnection', (_e, args: { skillId: string; config: Record<string, string> }) => {
    return manager.testConnection(args.skillId, args.config ?? {})
  })
}

export function createSkillManager(configDir: string): SkillManager {
  return new SkillManager(configDir)
}
