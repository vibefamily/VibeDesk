/**
 * News tools for agents.
 *
 * Fetches headlines from public RSS feeds (Node fetch, so it works
 * without CORS in the main process). The MVP uses Yahoo Finance's free
 * RSS headlines; the Info Center module (M3) will generalize this into
 * a pluggable source framework.
 */

import type { ToolDefinition } from '../runtime/types'

export interface NewsItem {
  title: string
  link: string
  publishedAt: string | null
}

/** Lightweight RSS title extraction (no XML dependency). */
export function parseRssTitles(xml: string, limit: number): NewsItem[] {
  const items: NewsItem[] = []
  const itemRe = /<item>([\s\S]*?)<\/item>/g
  let match: RegExpExecArray | null
  while ((match = itemRe.exec(xml)) !== null && items.length < limit) {
    const block = match[1]!
    const title = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1]?.trim()
    const link = block.match(/<link>(.*?)<\/link>/)?.[1]?.trim()
    const pub = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]?.trim() ?? null
    if (title) {
      items.push({ title: title.replace(/<!\[CDATA\[|\]\]>/g, ''), link: link ?? '', publishedAt: pub })
    }
  }
  return items
}

/**
 * Fetch the latest headlines for a symbol from Yahoo Finance RSS.
 * Returns a tool that works without an API key.
 */
export function createNewsTool(): ToolDefinition {
  return {
    name: 'fetch_news',
    description:
      'Fetch the latest public headlines for a stock symbol (e.g., TSLA, NVDA) from a free RSS feed. Returns the top headlines with timestamps.',
    parameters: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Stock ticker symbol, e.g., TSLA, NVDA, AAPL',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of headlines to return (default 5)',
        },
      },
      required: ['symbol'],
    },
    execute: async (args) => {
      const symbol = String(args.symbol ?? '').toUpperCase().trim()
      const limit = Math.min(10, Math.max(1, Number(args.limit) || 5))
      if (!/^[A-Z.]{1,10}$/.test(symbol)) {
        return { success: false, content: `Invalid symbol: ${symbol}` }
      }
      try {
        const url = `https://finance.yahoo.com/rss/headline?s=${encodeURIComponent(symbol)}`
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (VibeDesk Agent)' },
        })
        if (!res.ok) {
          return { success: false, content: `News feed returned HTTP ${res.status}` }
        }
        const xml = await res.text()
        const items = parseRssTitles(xml, limit)
        if (items.length === 0) {
          return { success: true, content: `No recent headlines found for ${symbol}.` }
        }
        const lines = items.map(
          (n, i) => `${i + 1}. ${n.title}${n.publishedAt ? ` (${n.publishedAt})` : ''}`,
        )
        return {
          success: true,
          content: `Latest headlines for ${symbol}:\n${lines.join('\n')}`,
          data: items,
        }
      } catch (err) {
        return {
          success: false,
          content: `News fetch failed: ${err instanceof Error ? err.message : String(err)}`,
        }
      }
    },
  }
}
