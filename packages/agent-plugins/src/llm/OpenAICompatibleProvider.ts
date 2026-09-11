/**
 * OpenAI-compatible LLM provider.
 *
 * Speaks the /chat/completions protocol with function/tool calling, so it
 * works with OpenAI, DeepSeek, Moonshot, local models (vLLM / Ollama /
 * LM Studio) and any other provider that implements the OpenAI wire
 * format. The base URL and API key come from the user's local settings.
 */

import type { ChatMessage, LLMProvider, ToolCall, ToolDefinition } from '../runtime/types'

export interface OpenAIConfig {
  /** e.g. https://api.openai.com/v1 or https://api.deepseek.com/v1 */
  baseUrl: string
  apiKey: string
  /** Model id, e.g. gpt-4o-mini, deepseek-chat */
  model: string
}

interface OpenAIToolSchema {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

function toToolSchemas(tools?: ToolDefinition[]): OpenAIToolSchema[] | undefined {
  if (!tools || tools.length === 0) return undefined
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }))
}

function parseToolCalls(raw: unknown[] | undefined): ToolCall[] | undefined {
  if (!raw || raw.length === 0) return undefined
  return raw.map((call) => {
    const c = call as {
      id?: string
      function?: { name?: string; arguments?: string }
    }
    let args: Record<string, unknown> = {}
    if (c.function?.arguments) {
      try {
        args = JSON.parse(c.function.arguments) as Record<string, unknown>
      } catch {
        args = {}
      }
    }
    return {
      id: c.id ?? `call_${Math.random().toString(36).slice(2)}`,
      name: c.function?.name ?? '',
      arguments: args,
    }
  })
}

export class OpenAICompatibleProvider implements LLMProvider {
  readonly id = 'openai-compatible'
  private config: OpenAIConfig

  constructor(config: OpenAIConfig) {
    this.config = config
  }

  updateConfig(config: OpenAIConfig): void {
    this.config = config
  }

  getConfig(): OpenAIConfig {
    return { ...this.config }
  }

  async chatComplete(params: {
    messages: ChatMessage[]
    tools?: ToolDefinition[]
    model: string
    temperature?: number
    signal?: AbortSignal
  }): Promise<ChatMessage> {
    const { messages, tools, model, temperature, signal } = params
    const url = `${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`

    const body: Record<string, unknown> = {
      model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: temperature ?? 0.7,
    }
    const schemas = toToolSchemas(tools)
    if (schemas) {
      body.tools = schemas
      body.tool_choice = 'auto'
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`LLM request failed (${res.status}): ${detail.slice(0, 300)}`)
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string | null; tool_calls?: unknown[] } }[]
    }
    const message = data.choices?.[0]?.message
    if (!message) {
      throw new Error('LLM response contained no choices')
    }

    return {
      role: 'assistant',
      content: message.content ?? '',
      toolCalls: parseToolCalls(message.tool_calls),
    }
  }
}
