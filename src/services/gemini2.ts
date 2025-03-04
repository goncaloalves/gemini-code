import { GoogleGenerativeAI, GenerativeModel, GenerationConfig, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { randomUUID } from 'crypto';
import { Tool } from '../Tool.js';
import { withVCR } from './vcr.js';
import { logEvent } from './statsig.js';
import { addToTotalCost } from '../cost-tracker.js';
import { createAssistantAPIErrorMessage } from '../utils/messages.js';
import { logError } from '../utils/log.js';
import { getOrCreateUserID } from '../utils/config.js';
import { AssistantMessage, UserMessage } from '../query.js';

// Constants
const MAX_RETRIES = 10;
const BASE_DELAY_MS = 500;
const API_ERROR_MESSAGE_PREFIX = 'API Error';
const INVALID_API_KEY_ERROR_MESSAGE = 'Invalid API key · Please check your GOOGLE_API_KEY';
const NO_CONTENT_MESSAGE = '(no content)';

// Gemini Pro costs per 1k tokens (as of March 2024)
const GEMINI_PRO_COST_PER_1K_INPUT_TOKENS = 0.00025;
const GEMINI_PRO_COST_PER_1K_OUTPUT_TOKENS = 0.0005;

let geminiModel: GenerativeModel | null = null;

function getMetadata() {
  return {
    user_id: getOrCreateUserID(),
    session_id: randomUUID(),
  };
}

function shouldRetry(error: Error): boolean {
  const retryableErrors = [
    'RESOURCE_EXHAUSTED',
    'UNAVAILABLE',
    'DEADLINE_EXCEEDED',
    'INTERNAL',
    'CANCELLED',
    'ABORTED'
  ];
  return retryableErrors.some(e => error.message.includes(e));
}

async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  maxRetries: number = MAX_RETRIES
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      
      if (attempt > maxRetries || !shouldRetry(error)) {
        throw error;
      }

      const delayMs = Math.min(BASE_DELAY_MS * Math.pow(2, attempt - 1), 32000);
      console.log(`Retrying in ${delayMs}ms... (attempt ${attempt}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  throw lastError;
}

export async function initGemini(model = "gemini-pro"): Promise<GenerativeModel> {
  if (!process.env.GOOGLE_API_KEY) {
    throw new Error('GOOGLE_API_KEY environment variable is not set');
  }

  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  geminiModel = genAI.getGenerativeModel({ 
    model,
    safetySettings: [
      {
        category: HarmCategory.HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
      {
        category: HarmCategory.HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
      {
        category: HarmCategory.DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
    ],
  });
  return geminiModel;
}

export async function verifyApiKey(apiKey: string): Promise<boolean> {
  const genAI = new GoogleGenerativeAI(apiKey);
  try {
    await withRetry(
      async () => {
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        const result = await model.generateContent("test");
        return result.response.text();
      },
      2 // Use fewer retries for API key verification
    );
    return true;
  } catch (error) {
    logError(error);
    if (error instanceof Error && error.message.includes('API key not valid')) {
      return false;
    }
    throw error;
  }
}

export async function queryGemini2(
  messages: (UserMessage | AssistantMessage)[],
  systemPrompt: string[],
  tools?: Tool[],
  signal?: AbortSignal
): Promise<AssistantMessage> {
  return await withVCR(messages, async () => {
    const startTime = Date.now();
    let response;

    try {
      if (!geminiModel) {
        await initGemini();
      }

      const generationConfig: GenerationConfig = {
        temperature: 0.7,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 2048,
      };

      // Convert messages to Gemini format and add system prompt
      const formattedMessages = messages.map(msg => ({
        role: msg.message.role,
        parts: [{ text: typeof msg.message.content === 'string' ? 
          msg.message.content : 
          msg.message.content.map(c => (c.type === 'text' ? c.text : '')).join('\n')
        }]
      }));

      // Add system prompt as first message if present
      if (systemPrompt.length > 0) {
        formattedMessages.unshift({
          role: 'user',
          parts: [{ text: systemPrompt.join('\n') }]
        });
      }

      response = await withRetry(async (attempt) => {
        const chat = geminiModel.startChat({
          generationConfig,
          history: formattedMessages,
          tools: tools?.map(tool => ({
            functionDeclarations: [{
              name: tool.name,
              description: tool.description(),
              parameters: tool.inputSchema
            }]
          }))
        });

        const result = await chat.sendMessage(
          formattedMessages[formattedMessages.length - 1].parts[0].text,
          { signal }
        );

        return result;
      });

      const durationMs = Date.now() - startTime;
      const usage = await response.response.promptFeedback;
      
      // Calculate cost (approximate as Gemini doesn't provide exact token counts)
      const totalTokens = usage?.tokenCount?.totalTokens || 0;
      const inputTokens = usage?.tokenCount?.promptTokens || 0;
      const outputTokens = totalTokens - inputTokens;
      
      const costUSD = 
        (inputTokens / 1000) * GEMINI_PRO_COST_PER_1K_INPUT_TOKENS +
        (outputTokens / 1000) * GEMINI_PRO_COST_PER_1K_OUTPUT_TOKENS;
      
      addToTotalCost(costUSD, durationMs);

      logEvent('gemini_api_success', {
        messageCount: String(messages.length),
        durationMs: String(durationMs),
        tokens: String(totalTokens),
      });

      return {
        message: {
          role: 'assistant',
          content: response.response.text() || NO_CONTENT_MESSAGE,
          id: randomUUID(),
          model: 'gemini-pro',
          type: 'message',
          usage: {
            total_tokens: totalTokens,
            prompt_tokens: inputTokens,
            completion_tokens: outputTokens,
          }
        },
        costUSD,
        durationMs,
        type: 'assistant',
        uuid: randomUUID()
      };

    } catch (error) {
      logError(error);
      logEvent('gemini_api_error', {
        error: error.message,
        durationMs: String(Date.now() - startTime)
      });
      return createAssistantAPIErrorMessage(
        `${API_ERROR_MESSAGE_PREFIX}: ${error.message}`
      );
    }
  });
}

// Helper function to get error message
function getAssistantMessageFromError(error: unknown): AssistantMessage {
  if (error instanceof Error) {
    if (error.message.includes('API key not valid')) {
      return createAssistantAPIErrorMessage(INVALID_API_KEY_ERROR_MESSAGE);
    }
    return createAssistantAPIErrorMessage(
      `${API_ERROR_MESSAGE_PREFIX}: ${error.message}`
    );
  }
  return createAssistantAPIErrorMessage(API_ERROR_MESSAGE_PREFIX);
}

export function resetGeminiClient(): void {
  geminiModel = null;
}

// Function to handle streaming (if needed)
async function handleStream(response: any, signal?: AbortSignal) {
  // Implementation for streaming responses
  // Note: Implement if Gemini supports streaming
  return response;
}
