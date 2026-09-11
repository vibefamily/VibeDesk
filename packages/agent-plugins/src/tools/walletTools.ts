/**
 * Wallet read tools for agents.
 *
 * Agents may only see what the user explicitly authorized (Grant Agent
 * in the Wallets view). This tool surfaces the authorized wallet
 * addresses - public metadata - so the LLM can reference "which wallet
 * would this trade be for". Secrets never leave the main process.
 */

import type { ToolDefinition } from '../runtime/types'

/** Narrow read-only view of the vault for agents. */
export interface WalletReadAccess {
  listAuthorizedWallets(): { id: string; address: string; name: string }[]
}

/** Tool: list wallets the user has authorized the Agent to see. */
export function createWalletReadTool(access: WalletReadAccess): ToolDefinition {
  return {
    name: 'list_authorized_wallets',
    description:
      'List the wallets the user has authorized for this agent (addresses only). Use this to know which wallet a recommendation would apply to.',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async () => {
      const wallets = access.listAuthorizedWallets()
      if (wallets.length === 0) {
        return {
          success: true,
          content:
            'No authorized wallets. The user must grant access in the Wallets view first.',
          data: [],
        }
      }
      const lines = wallets.map((w) => `- ${w.name}: ${w.address}`)
      return {
        success: true,
        content: `Authorized wallets:\n${lines.join('\n')}`,
        data: wallets,
      }
    },
  }
}
