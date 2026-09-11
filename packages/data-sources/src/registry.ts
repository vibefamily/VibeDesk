/**
 * Data source registry and provider manifests.
 *
 * A manifest describes a provider's capabilities in a declarative way so
 * the UI and Agent can render source cards, gate features on auth state,
 * and (later) load third-party providers from the local plugin directory.
 */

import type { IMarketDataProvider } from '@vibe/core'

/** Provider kind - where the data comes from. */
export type ProviderKind = 'cex' | 'dex' | 'broker' | 'chain' | 'aggregator'

/** Asset scope a provider can serve. */
export type ProviderAssetScope = 'stocks' | 'crypto' | 'stocks+crypto'

/** Update modes a provider supports. */
export type ProviderUpdateMode = 'rest' | 'ws' | 'polling'

/** Declarative description of a market data provider. */
export interface ProviderManifest {
  /** Provider id, must match IMarketDataProvider.id */
  id: string
  /** Display name, e.g. "Robinhood" */
  name: string
  /** Where the data comes from */
  kind: ProviderKind
  /** Which assets this provider can serve */
  assetScope: ProviderAssetScope
  /** Whether the provider needs a user API key / credentials */
  authRequired: boolean
  /** How the provider delivers real-time updates */
  updateMode: ProviderUpdateMode[]
  /** One-line description shown in the UI */
  description: string
  /** Optional privacy note (e.g. "public endpoint, no account access") */
  privacyNote?: string
}

/** Registry entry: provider instance + its manifest. */
export interface ProviderEntry {
  provider: IMarketDataProvider
  manifest: ProviderManifest
}

/**
 * Registry of market data providers with their manifests.
 */
export class DataSourceRegistry {
  private entries = new Map<string, ProviderEntry>()

  register(provider: IMarketDataProvider, manifest: ProviderManifest): void {
    if (manifest.id !== provider.id) {
      throw new Error(`Manifest id "${manifest.id}" does not match provider id "${provider.id}"`)
    }
    this.entries.set(provider.id, { provider, manifest })
  }

  get(id: string): ProviderEntry | undefined {
    return this.entries.get(id)
  }

  list(): ProviderEntry[] {
    return Array.from(this.entries.values())
  }

  listManifests(): ProviderManifest[] {
    return this.list().map((e) => e.manifest)
  }

  /** Whether a provider is available for a symbol (no throw). */
  async hasPrice(id: string, symbol: string): Promise<boolean> {
    const entry = this.entries.get(id)
    if (!entry) {
      return false
    }
    try {
      await entry.provider.getTick(symbol)
      return true
    } catch {
      return false
    }
  }
}
