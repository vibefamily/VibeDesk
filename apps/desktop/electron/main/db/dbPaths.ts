/**
 * SQLite storage layout for the desktop app.
 *
 * All databases live under `userData/db/`, organized by domain so more
 * databases can be added later without restructuring:
 *
 *   userData/db/
 *     market/stock-history.db   - multi-provider price history (this module)
 *     agents/<agentId>.db       - per-agent conversation/memory context
 *     info.db                   - news/tweet feed cache
 *     vault.db                  - wallet index (future)
 *
 * Each database is an independent SQLite file with its own connection
 * (WAL mode). Add a new domain by calling dbFile() with the desired
 * sub-path - no layout changes needed.
 */

import path from 'node:path'
import fs from 'node:fs'

let dbRoot: string | null = null

/** Set the DB root (userData/db). Call once during app startup. */
export function initDbRoot(userDataDir: string): void {
  dbRoot = path.join(userDataDir, 'db')
  fs.mkdirSync(dbRoot, { recursive: true })
}

/** Absolute path for a database file, creating parent directories. */
export function dbFile(...parts: string[]): string {
  if (!dbRoot) throw new Error('initDbRoot() must be called before dbFile()')
  const file = path.join(dbRoot, ...parts)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  return file
}

/** Shorthand: the stock price history database path. */
export function stockHistoryDbPath(): string {
  return dbFile('market', 'stock-history.db')
}

/** Shorthand: a per-agent context database path. */
export function agentContextDbPath(agentId: string): string {
  // agent ids are generated (`agt_<random>`), safe as filenames
  return dbFile('agents', `${agentId}.db`)
}
