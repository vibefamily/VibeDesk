/**
 * Agent storage abstraction.
 *
 * AgentManager persists instances through an AgentStorage so the backing
 * store can evolve (JSON files today, SQLite later) without touching the
 * agent layer or IPC surface.
 */

import { mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AgentInstanceView } from '../AgentManager'

/** A persisted agent instance snapshot. */
export interface AgentSnapshot {
  view: AgentInstanceView
  running: boolean
}

/** Storage contract for agent instances. */
export interface AgentStorage {
  /** Persist (overwrite) one agent instance. */
  saveAgent(id: string, snapshot: AgentSnapshot): void
  /** Load every persisted instance. */
  loadAgents(): AgentSnapshot[]
  /** Delete one persisted instance (idempotent). */
  removeAgent(id: string): void
}

/** Per-agent JSON files in a directory (current default backend). */
export class JsonFileAgentStorage implements AgentStorage {
  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true })
  }

  saveAgent(id: string, snapshot: AgentSnapshot): void {
    writeFileSync(
      join(this.dir, `${id}.json`),
      JSON.stringify(snapshot, null, 2),
      { encoding: 'utf8', mode: 0o600 },
    )
  }

  loadAgents(): AgentSnapshot[] {
    let files: string[] = []
    try {
      files = readdirSync(this.dir).filter((f) => f.endsWith('.json'))
    } catch {
      return []
    }
    const out: AgentSnapshot[] = []
    for (const f of files) {
      try {
        out.push(JSON.parse(readFileSync(join(this.dir, f), 'utf8')) as AgentSnapshot)
      } catch {
        // skip corrupt files
      }
    }
    return out
  }

  removeAgent(id: string): void {
    try {
      unlinkSync(join(this.dir, `${id}.json`))
    } catch {
      // already gone
    }
  }
}
