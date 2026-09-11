/**
 * Info tools for agents (M3).
 *
 * Lets any agent search the locally-cached information store (news
 * headlines + tweets pulled by the Info Center scheduler). Reading from
 * local storage is instant and works without API keys, complementing
 * the live fetch_news tool.
 */

import type { ToolDefinition } from '../runtime/types'
import type { InfoItem, InfoSearchQuery } from '@vibe/shared'

/** Read-only bridge into the main-process InfoManager. */
export interface InfoStore {
  search(query: InfoSearchQuery): Promise<InfoItem[]>
}

/** Tool: read_information - search locally cached news/tweets. */
export function createInfoReadTool(store: InfoStore): ToolDefinition {
  return {
    name: 'read_information',
    description:
      'Search locally cached market information (news headlines and tweets) for a symbol or keywords. Faster and more reliable than live fetching. Returns the top items with source and time.',
    parameters: {
      type: 'object',
      properties: {
        symbols: {
          type: 'array',
          items: { type: 'string' },
          description: 'Stock ticker symbols to filter by, e.g. ["TSLA", "NVDA"]',
        },
        query: {
          type: 'string',
          description: 'Free-text keyword to search for',
        },
        kind: {
          type: 'string',
          enum: ['news', 'tweet'],
          description: 'Only return news or tweets',
        },
        limit: {
          type: 'number',
          description: 'Maximum items to return (default 5)',
        },
      },
    },
    execute: async (args) => {
      const symbols = Array.isArray(args.symbols)
        ? args.symbols.map((s: unknown) => String(s).toUpperCase().trim()).filter(Boolean)
        : []
      const query = String(args.query ?? '').trim()
      const kind = args.kind === 'tweet' ? 'tweet' : args.kind === 'news' ? 'news' : undefined
      const limit = Math.min(10, Math.max(1, Number(args.limit) || 5))
      try {
        const items = await store.search({ symbols, query, kind, limit: 20 })
        if (items.length === 0) {
          return {
            success: true,
            content: 'No cached information matches the query. Try fetch_news for live headlines.',
          }
        }
        const lines = items.slice(0, limit).map(
          (it, i) =>
            `${i + 1}. [${it.kind === 'tweet' ? 'tweet' : 'news'}] ${it.title} — ${
              it.sourceName
            } (${it.publishedAt})${it.summary ? `\n   ${it.summary.slice(0, 160)}` : ''}`,
        )
        return {
          success: true,
          content: `Cached information (${items.length} matches):\n${lines.join('\n')}`,
          data: items.slice(0, limit),
        }
      } catch (err) {
        return {
          success: false,
          content: `Info search failed: ${err instanceof Error ? err.message : String(err)}`,
        }
      }
    },
  }
}
