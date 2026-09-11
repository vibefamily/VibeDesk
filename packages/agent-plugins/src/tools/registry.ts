/**
 * Tool registry - manages all available tools for agents.
 */

import type { ToolDefinition } from '../runtime/types'

/**
 * Global tool registry.
 *
 * Tools are registered centrally and agents can reference them by name
 * in their configuration. This allows tools to be added via plugins.
 */
export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>()

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      console.warn(`[ToolRegistry] Tool '${tool.name}' already registered, overwriting.`)
    }
    this.tools.set(tool.name, tool)
  }

  registerAll(tools: ToolDefinition[]): void {
    for (const tool of tools) {
      this.register(tool)
    }
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name)
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values())
  }

  has(name: string): boolean {
    return this.tools.has(name)
  }

  /** Get tools by name (for configuring agent tool lists) */
  getMany(names: string[]): ToolDefinition[] {
    return names
      .map((name) => this.tools.get(name))
      .filter((t): t is ToolDefinition => t !== undefined)
  }
}

/** Global tool registry singleton */
export const toolRegistry = new ToolRegistry()
