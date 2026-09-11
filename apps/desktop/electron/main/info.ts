/**
 * Info Manager (M3) - multi-source information center.
 *
 * Runs in the Electron main process:
 * - persists user-configured sources (info-sources.json, 0600)
 * - pulls RSS news feeds (Yahoo Finance etc.) on a per-source schedule
 * - keeps a bounded local cache (info-items.json, newest N items)
 * - exposes IPC (info:*) + a search bridge for agents (read_information)
 *
 * Twitter (kind = 'twitter') is wired to a third-party aggregator
 * (Apify) once a token is configured; without credentials the source
 * stays disabled with a clear UI hint.
 */

import { ipcMain, webContents } from 'electron'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  InfoItem,
  InfoSearchQuery,
  InfoSourceConfig,
  InfoSourceStatus,
  InfoState,
} from '@vibe/shared'
import { DEFAULT_STOCK_TICKERS } from '@vibe/shared'
import { parseRssTitles } from '@vibe/agent-plugins'

const MAX_CACHE = 1000
const DEFAULT_SOURCES: InfoSourceConfig[] = [
  {
    id: 'yahoo-tsla',
    kind: 'rss',
    name: 'Yahoo Finance - TSLA',
    enabled: true,
    url: 'https://finance.yahoo.com/rss/headline?s=TSLA',
    symbols: ['TSLA'],
    intervalMinutes: 15,
  },
]

interface InfoManagerOptions {
  dataDir: string
}

interface FeedSourceItem {
  title: string
  link: string
  publishedAt: string | null
  description?: string
}

/** Strip HTML tags for a plain-text summary. */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/** Detect tracked symbols mentioned in a title/description. */
function detectSymbols(text: string, allSymbols: string[]): string[] {
  const upper = text.toUpperCase()
  return allSymbols.filter((s) => new RegExp(`\\b${s}\\b`).test(upper))
}

/** Enhanced RSS parsing that also extracts a summary. */
function parseFeed(xml: string, limit: number): FeedSourceItem[] {
  const items: FeedSourceItem[] = []
  const itemRe = /<item>([\s\S]*?)<\/item>/g
  let match: RegExpExecArray | null
  while ((match = itemRe.exec(xml)) !== null && items.length < limit) {
    const block = match[1]!
    const title =
      block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1]?.trim() ?? ''
    const link = block.match(/<link>(.*?)<\/link>/)?.[1]?.trim() ?? ''
    const pub = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]?.trim() ?? null
    const desc =
      block.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/)?.[1]?.trim() ??
      null
    if (title) {
      items.push({
        title: title.replace(/<!\[CDATA\[|\]\]>/g, '').trim(),
        link,
        publishedAt: pub,
        description: desc ? stripHtml(desc).slice(0, 300) : undefined,
      })
    }
  }
  return items
}

export class InfoManager {
  private sources: InfoSourceConfig[] = []
  private items: InfoItem[] = []
  private statuses: Record<string, InfoSourceStatus> = {}
  private pulling = new Set<string>()
  private timers = new Map<string, ReturnType<typeof setInterval>>()
  private dataDir: string
  private sourcesPath = ''
  private itemsPath = ''

  constructor(options: InfoManagerOptions) {
    this.dataDir = options.dataDir
    this.sourcesPath = join(options.dataDir, 'info-sources.json')
    this.itemsPath = join(options.dataDir, 'info-items.json')
  }

  /** Load persisted state and (re)start schedulers. Call once at startup. */
  init(): void {
    this.load()
    this.scheduleAll()
  }

  private load(): void {
    try {
      if (existsSync(this.sourcesPath)) {
        const raw = JSON.parse(readFileSync(this.sourcesPath, 'utf8')) as InfoSourceConfig[]
        if (Array.isArray(raw)) this.sources = raw.filter((s) => s && s.id && s.kind)
      }
    } catch (err) {
      console.warn('[info] failed to load sources:', err)
    }
    if (this.sources.length === 0) {
      this.sources = DEFAULT_SOURCES.map((s) => ({ ...s, symbols: [...s.symbols] }))
      this.persistSources()
    }
    try {
      if (existsSync(this.itemsPath)) {
        const raw = JSON.parse(readFileSync(this.itemsPath, 'utf8')) as InfoItem[]
        if (Array.isArray(raw)) this.items = raw.slice(0, MAX_CACHE)
      }
    } catch (err) {
      console.warn('[info] failed to load items:', err)
    }
  }

  private persistSources(): void {
    try {
      mkdirSync(this.dataDir, { recursive: true })
      writeFileSync(this.sourcesPath, JSON.stringify(this.sources, null, 2), {
        encoding: 'utf8',
        mode: 0o600,
      })
    } catch (err) {
      console.error('[info] failed to persist sources:', err)
    }
  }

  private persistItems(): void {
    try {
      writeFileSync(this.itemsPath, JSON.stringify(this.items.slice(0, MAX_CACHE), null, 2), {
        encoding: 'utf8',
        mode: 0o600,
      })
    } catch (err) {
      console.error('[info] failed to persist items:', err)
    }
  }

  private setStatus(sourceId: string, patch: Partial<InfoSourceStatus>): void {
    const cur = this.statuses[sourceId] ?? { sourceId, lastPullAt: null, lastCount: 0, error: null }
    this.statuses[sourceId] = { ...cur, ...patch }
  }

  private emit(): void {
    for (const wc of webContents.getAllWebContents()) {
      wc.send('info:event', this.getState())
    }
  }

  getState(): InfoState {
    return { sources: this.sources, statuses: this.statuses, items: this.items.slice(0, 200) }
  }

  search(query: InfoSearchQuery): Promise<InfoItem[]> {
    const q = (query.query ?? '').toLowerCase().trim()
    const symbols = (query.symbols ?? []).map((s) => s.toUpperCase())
    const kind = query.kind
    const limit = Math.min(50, Math.max(1, query.limit ?? 10))
    const result = this.items
      .filter((it) => {
        if (kind && it.kind !== kind) return false
        if (symbols.length > 0 && !it.symbols.some((s) => symbols.includes(s))) return false
        if (q) {
          const hay = `${it.title} ${it.summary ?? ''} ${it.author ?? ''}`.toLowerCase()
          if (!hay.includes(q)) return false
        }
        return true
      })
      .slice(0, limit)
    return Promise.resolve(result)
  }

  /** Upsert (by id) or create a source; restarts its scheduler. */
  upsertSource(input: Partial<InfoSourceConfig> & { id?: string }): InfoState {
    const existing = input.id ? this.sources.find((s) => s.id === input.id) : undefined
    const source: InfoSourceConfig = existing
      ? { ...existing, ...input, id: existing.id }
      : {
          id: input.id ?? `src-${randomUUID().slice(0, 8)}`,
          kind: input.kind ?? 'rss',
          name: input.name ?? 'New source',
          enabled: input.enabled ?? true,
          url: input.url,
          symbols: input.symbols ?? [],
          keywords: input.keywords,
          intervalMinutes: Math.max(1, input.intervalMinutes ?? 15),
        }
    if (existing) {
      this.sources = this.sources.map((s) => (s.id === source.id ? source : s))
    } else {
      this.sources.push(source)
    }
    this.persistSources()
    this.scheduleOne(source)
    if (source.enabled && source.kind === 'rss' && source.url) {
      void this.pullSource(source.id)
    }
    return this.getState()
  }

  deleteSource(id: string): InfoState {
    this.sources = this.sources.filter((s) => s.id !== id)
    const timer = this.timers.get(id)
    if (timer) clearInterval(timer)
    this.timers.delete(id)
    this.items = this.items.filter((it) => it.sourceId !== id)
    this.persistSources()
    this.persistItems()
    return this.getState()
  }

  async refreshNow(id?: string): Promise<InfoState> {
    const targets = id ? this.sources.filter((s) => s.id === id) : this.sources.filter((s) => s.enabled)
    await Promise.all(targets.map((s) => this.pullSource(s.id)))
    return this.getState()
  }

  /** Pull one source; guarded against overlapping pulls. */
  async pullSource(sourceId: string): Promise<void> {
    const source = this.sources.find((s) => s.id === sourceId)
    if (!source) return
    if (this.pulling.has(sourceId)) return
    this.pulling.add(sourceId)
    try {
      if (source.kind === 'twitter') {
        const { APIFY_API_TOKEN } = process.env
        if (!APIFY_API_TOKEN) {
          this.setStatus(sourceId, { lastPullAt: Date.now(), lastCount: 0, error: 'Apify token not configured (env APIFY_API_TOKEN)' })
          return
        }
        await this.pullTwitter(source, APIFY_API_TOKEN)
      } else if (source.url) {
        await this.pullRss(source)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn(`[info] pull failed for ${source.name}:`, message)
      this.setStatus(sourceId, { lastPullAt: Date.now(), lastCount: 0, error: message })
    } finally {
      this.pulling.delete(sourceId)
      this.emit()
    }
  }

  private async pullRss(source: InfoSourceConfig): Promise<void> {
    const url = source.url!
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (VibeDesk)' } })
    if (!res.ok) throw new Error(`RSS feed returned HTTP ${res.status}`)
    const xml = await res.text()
    const parsed = parseFeed(xml, 20)
    const allSymbols = [...new Set([...DEFAULT_STOCK_TICKERS, ...source.symbols])]
    const newItems: InfoItem[] = parsed.map((p) => {
      const text = `${p.title} ${p.description ?? ''}`
      const symbols = source.symbols.length > 0 ? source.symbols : detectSymbols(text, allSymbols)
      return {
        id: `${source.id}-${p.link}`,
        sourceId: source.id,
        sourceName: source.name,
        kind: 'news',
        title: p.title,
        url: p.link,
        summary: p.description,
        publishedAt: p.publishedAt ?? new Date().toISOString(),
        fetchedAt: new Date().toISOString(),
        symbols,
      }
    })
    if (newItems.length > 0) {
      const known = new Set(this.items.map((it) => it.id))
      const fresh = newItems.filter((it) => !known.has(it.id))
      if (fresh.length > 0) {
        this.items = [...fresh, ...this.items].slice(0, MAX_CACHE)
        this.persistItems()
      }
    }
    this.setStatus(source.id, { lastPullAt: Date.now(), lastCount: newItems.length, error: null })
    console.log(`[info] ${source.name}: ${newItems.length} items (${this.items.length} cached)`)
  }

  /** Twitter via Apify: fetch a keyword search feed as JSON. */
  private async pullTwitter(source: InfoSourceConfig, token: string): Promise<void> {
    const keywords = source.keywords ?? []
    if (keywords.length === 0) throw new Error('No Twitter keywords configured')
    // Apify Twitter Scraper actor: https://apify.com/apidojo/tweet-scraper
    const url = `https://api.apify.com/v2/acts/apidojo~tweet-scraper/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ searchTerms: keywords, maxItems: 20 }),
    })
    if (!res.ok) throw new Error(`Apify returned HTTP ${res.status}`)
    const tweets = (await res.json()) as Array<{
      text?: string
      url?: string
      createdAt?: string
      user?: { name?: string; username?: string }
    }>
    const allSymbols = [...new Set([...DEFAULT_STOCK_TICKERS, ...source.symbols])]
    const newItems: InfoItem[] = tweets
      .filter((t) => t.text)
      .map((t, i) => ({
        id: `${source.id}-${i}-${t.url ?? Math.random().toString(36).slice(2)}`,
        sourceId: source.id,
        sourceName: source.name,
        kind: 'tweet' as const,
        title: (t.text ?? '').slice(0, 280),
        url: t.url ?? 'https://x.com',
        author: t.user?.name ?? t.user?.username,
        publishedAt: t.createdAt ?? new Date().toISOString(),
        fetchedAt: new Date().toISOString(),
        symbols: detectSymbols(t.text ?? '', allSymbols),
      }))
    if (newItems.length > 0) {
      this.items = [...newItems, ...this.items].slice(0, MAX_CACHE)
      this.persistItems()
    }
    this.setStatus(source.id, { lastPullAt: Date.now(), lastCount: newItems.length, error: null })
  }

  private scheduleAll(): void {
    for (const source of this.sources) this.scheduleOne(source)
  }

  private scheduleOne(source: InfoSourceConfig): void {
    const old = this.timers.get(source.id)
    if (old) clearInterval(old)
    if (!source.enabled) return
    const ms = Math.max(60_000, source.intervalMinutes * 60_000)
    const timer = setInterval(() => {
      void this.pullSource(source.id)
    }, ms)
    this.timers.set(source.id, timer)
  }
}

let infoManager: InfoManager | null = null

/** Wire info:* IPC + start the manager. Call once after app ready. */
export function setupInfoIpc(options: { dataDir: string }): void {
  const manager = new InfoManager({ dataDir: options.dataDir })
  manager.init()
  infoManager = manager

  ipcMain.handle('info:getState', () => manager.getState())
  ipcMain.handle('info:upsertSource', (_e, input: Partial<InfoSourceConfig> & { id?: string }) =>
    manager.upsertSource(input ?? {}),
  )
  ipcMain.handle('info:deleteSource', (_e, id: string) => manager.deleteSource(String(id)))
  ipcMain.handle('info:refreshNow', (_e, id?: string) => manager.refreshNow(id ? String(id) : undefined))
  ipcMain.handle('info:search', (_e, query: InfoSearchQuery) => manager.search(query ?? {}))

  // Kick an immediate pull for enabled RSS sources so the cache is warm.
  void manager.refreshNow().catch(() => undefined)
}

/** The running manager (for agent tool wiring); null before setup. */
export function getInfoManager(): InfoManager | null {
  return infoManager
}
