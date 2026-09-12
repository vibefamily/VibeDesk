/**
 * StockHistoryDb - SQLite-backed multi-provider price history.
 *
 * Implemented on sql.js (SQLite compiled to WASM) so the desktop app has
 * zero native-module dependency: better-sqlite3's prebuilt N-API binary
 * hung inside Electron's main process, so we switched to the WASM build,
 * which is portable and has identical SQL semantics.
 *
 * One row per (symbol, provider, minute-bucket); the market poller
 * upserts the latest tick each round, so history grows at ~1 point per
 * minute per provider. The whole database is exported to disk on every
 * write - the store is small (a few KB) at this granularity.
 */

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js'
import type { MarketSnapshot } from '../market'

const require = createRequire(import.meta.url)

/** History point returned to the renderer. */
export interface HistoryPoint {
  ts: number // epoch seconds (minute bucket)
  price: number
}

export interface HistorySeries {
  provider: string
  points: HistoryPoint[]
}

const RETAIN_DAYS = 30

export class StockHistoryDb {
  private db: SqlJsDatabase
  private filePath: string
  private persistTimer: ReturnType<typeof setInterval> | null

  private constructor(db: SqlJsDatabase, filePath: string) {
    this.db = db
    this.filePath = filePath
    // Periodic flush is a safety net; every write also persists directly.
    this.persistTimer = setInterval(() => this.persist(), 60_000)
    if (typeof this.persistTimer.unref === 'function') this.persistTimer.unref()
  }

  /** Open (or create) the store and ensure the schema exists. */
  static async open(filePath: string): Promise<StockHistoryDb> {
    const dist = path.dirname(require.resolve('sql.js'))
    const SQL = await initSqlJs({ locateFile: (f) => path.join(dist, f) })
    let db: SqlJsDatabase
    if (fs.existsSync(filePath)) {
      db = new SQL.Database(fs.readFileSync(filePath))
    } else {
      db = new SQL.Database()
    }
    db.exec(`
      CREATE TABLE IF NOT EXISTS price_ticks (
        symbol   TEXT    NOT NULL,
        provider TEXT    NOT NULL,
        ts       INTEGER NOT NULL,
        price    REAL    NOT NULL,
        PRIMARY KEY (symbol, provider, ts)
      ) WITHOUT ROWID;
      CREATE INDEX IF NOT EXISTS idx_ticks_symbol_ts
        ON price_ticks(symbol, ts);
    `)
    const inst = new StockHistoryDb(db, filePath)
    inst.persist() // flush schema for a fresh file
    // Best-effort retention sweep on open (cheap, idempotent).
    try {
      inst.db.run(
        'DELETE FROM price_ticks WHERE ts < ?',
        [Math.floor(Date.now() / 1000) - RETAIN_DAYS * 86_400],
      )
      inst.persist()
    } catch {
      // retention is best-effort
    }
    return inst
  }

  /** Upsert one snapshot round; one point per minute-bucket per provider. */
  insertSnapshot(snapshot: MarketSnapshot): void {
    const now = Math.floor(Date.now() / 1000)
    const bucket = now - (now % 60)
    const stmt = this.db.prepare(
      'INSERT OR IGNORE INTO price_ticks (symbol, provider, ts, price) VALUES (?, ?, ?, ?)',
    )
    let rows = 0
    for (const [symbol, providers] of Object.entries(snapshot.ticks)) {
      for (const [provider, tick] of Object.entries(providers)) {
        const price = tick.lastPrice ?? (tick.bidPrice + tick.askPrice) / 2
        if (Number.isFinite(price)) {
          stmt.run([symbol, provider, bucket, price])
          rows++
        }
      }
    }
    stmt.free()
    if (rows > 0) this.persist()
  }

  /** History for one symbol, optionally filtered to providers. */
  queryHistory(
    symbol: string,
    providers?: string[],
    fromSec?: number,
    toSec?: number,
  ): HistorySeries[] {
    const conds = ['symbol = ?']
    const params: (string | number)[] = [symbol.toUpperCase()]
    if (providers && providers.length > 0) {
      conds.push(`provider IN (${providers.map(() => '?').join(',')})`)
      params.push(...providers)
    }
    if (fromSec != null) {
      conds.push('ts >= ?')
      params.push(fromSec)
    }
    if (toSec != null) {
      conds.push('ts <= ?')
      params.push(toSec)
    }
    const res = this.db.exec(
      `SELECT provider, ts, price FROM price_ticks
       WHERE ${conds.join(' AND ')} ORDER BY ts ASC`,
      params,
    )
    if (res.length === 0) return []
    const { columns, values } = res[0]!
    const iProvider = columns.indexOf('provider')
    const iTs = columns.indexOf('ts')
    const iPrice = columns.indexOf('price')
    const byProvider = new Map<string, HistoryPoint[]>()
    for (const row of values) {
      const provider = String(row[iProvider])
      const arr = byProvider.get(provider) ?? []
      arr.push({ ts: Number(row[iTs]), price: Number(row[iPrice]) })
      byProvider.set(provider, arr)
    }
    return [...byProvider.entries()].map(([provider, points]) => ({ provider, points }))
  }

  /** Remove rows older than retentionDays. */
  cleanup(retentionDays = RETAIN_DAYS): void {
    this.db.run('DELETE FROM price_ticks WHERE ts < ?', [
      Math.floor(Date.now() / 1000) - retentionDays * 86_400,
    ])
    this.persist()
  }

  /** Flush the in-memory database to disk. */
  persist(): void {
    try {
      const data = this.db.export()
      fs.writeFileSync(this.filePath, Buffer.from(data))
    } catch (e) {
      console.warn('[stock-history] persist failed:', (e as Error).message)
    }
  }

  close(): void {
    if (this.persistTimer) clearInterval(this.persistTimer)
    this.persist()
    this.db.close()
  }
}
