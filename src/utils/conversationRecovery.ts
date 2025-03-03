import fs from 'fs/promises'
import type { MessageType } from '../query.ts'
import type { Tool } from '../tools.ts'
import { logError } from './log.js'

/**
 * Load messages from a log file and deserialize them
 */
export async function loadMessagesFromLog(
  path: string,
  tools: Tool[],
): Promise<MessageType[]> {
  try {
    // Read and parse the messages file
    const content = await fs.readFile(path, 'utf-8')
    return deserializeMessages(JSON.parse(content), tools)
  } catch (error) {
    logError(`Failed to load messages from ${path}: ${error}`)
    throw error
  }
}

/**
 * Deserialize messages, rehydrating tool references
 */
export function deserializeMessages(
  messages: MessageType[],
  tools: Tool[],
): MessageType[] {
  // Create a map of tool names to tool instances for quick lookup
  const toolMap = new Map(tools.map(tool => [tool.name, tool]))

  return messages.map(message => {
    if (message.type === 'assistant' || message.type === 'progress') {
      // Rehydrate the tools array with actual tool instances
      message.tools = tools
    }
    return message
  })
}