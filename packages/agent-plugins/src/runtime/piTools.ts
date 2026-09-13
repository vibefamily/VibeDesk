/**
 * pi tool adapters.
 *
 * Converts VibeDesk's JSON-Schema tool definitions into @earendil-works/pi
 * ToolDefinitions (TypeBox schemas) so the pi agent harness can execute the
 * same market / wallet / news / info tools the legacy ReAct loop used.
 * Tool execution is forwarded to the original tool with the agent's
 * ToolContext; results are converted into pi AgentToolResult messages.
 */
import { Type } from 'typebox'
import type { TSchema, Static } from 'typebox'
import type { ToolDefinition as PiToolDefinition } from '@earendil-works/pi-coding-agent'
import type { AgentToolResult } from '@earendil-works/pi-agent-core'
import type { ToolDefinition, ToolContext } from './types'

/** Minimal JSON-Schema -> TypeBox converter (covers the fields our tools use). */
function jsonSchemaToTypeBox(schema: Record<string, unknown> | undefined): TSchema {
  if (!schema || typeof schema !== 'object') return Type.Any()
  const type = schema.type as string | undefined
  switch (type) {
    case 'string': {
      const enumVals = schema.enum as string[] | undefined
      return enumVals?.length ? Type.Union(enumVals.map((v) => Type.Literal(v))) : Type.String()
    }
    case 'number':
      return Type.Number()
    case 'integer':
      return Type.Integer()
    case 'boolean':
      return Type.Boolean()
    case 'array': {
      const items = (schema.items ?? {}) as Record<string, unknown>
      return Type.Array(jsonSchemaToTypeBox(items))
    }
    case 'object': {
      const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>
      const required = (schema.required ?? []) as string[]
      const entries = Object.entries(properties)
      const fields = Object.fromEntries(
        entries.map(([key, sub]) => [key, jsonSchemaToTypeBox(sub)]),
      ) as Record<string, TSchema>
      if (entries.length === 0) return Type.Object({})
      if (required.length === entries.length) return Type.Object(fields)
      return Type.Object(fields, { additionalProperties: false })
    }
    default:
      return Type.Any()
  }
}

/**
 * Wrap a VibeDesk tool definition as a pi ToolDefinition.
 * The wrapped tool keeps its original execute() so behavior (including
 * wallet/data-source scoping) is identical to the legacy runtime.
 */
export function toPiToolDefinition(tool: ToolDefinition, ctx: ToolContext): PiToolDefinition {
  return {
    name: tool.name,
    label: tool.name.replaceAll('_', ' '),
    description: tool.description,
    promptSnippet: tool.description.split('.')[0],
    parameters: jsonSchemaToTypeBox(tool.parameters) as never,
    execute: async (toolCallId, params): Promise<AgentToolResult<unknown>> => {
      const result = await tool.execute(params as Record<string, unknown>, ctx)
      return {
        details: { toolCallId },
        content: [
          {
            type: 'text',
            text: result.success ? result.content : `ERROR: ${result.error ?? result.content}`,
          },
        ],
      }
    },
  }
}

export { Type }
export type { TSchema, Static }
