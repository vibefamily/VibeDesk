/**
 * Configuration management for Vibe core.
 *
 * Handles loading, saving, and accessing application configuration.
 * In production this would persist to a local file or keychain.
 */

/** Global application configuration */
export interface AppConfig {
  /** Default language */
  language: string
  /** Theme setting */
  theme: 'light' | 'dark' | 'system'
  /** Whether to require confirmation before trade execution */
  requireTradeConfirmation: boolean
  /** Default quote currency */
  defaultQuoteCurrency: string
  /** Data refresh interval in milliseconds */
  refreshInterval: number
  /** Log level */
  logLevel: 'debug' | 'info' | 'warn' | 'error'
}

const DEFAULT_CONFIG: AppConfig = {
  language: 'en',
  theme: 'system',
  requireTradeConfirmation: true,
  defaultQuoteCurrency: 'USDT',
  refreshInterval: 1000,
  logLevel: 'info',
}

/**
 * ConfigStore - simple in-memory config store with change notifications.
 *
 * This can be extended to persist to disk (e.g., electron-store) or
 * the system keychain for sensitive values.
 */
export class ConfigStore {
  private config: AppConfig
  private listeners = new Set<(config: AppConfig) => void>()

  constructor(initial?: Partial<AppConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...initial }
  }

  get(): AppConfig {
    return { ...this.config }
  }

  set(partial: Partial<AppConfig>): void {
    this.config = { ...this.config, ...partial }
    for (const listener of this.listeners) {
      listener(this.config)
    }
  }

  onChange(listener: (config: AppConfig) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}
