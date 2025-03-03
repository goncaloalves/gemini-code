import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { Tool } from '../Tool.js';

let geminiModel: GenerativeModel | null = null;

export async function initGemini() {
  if (!process.env.GOOGLE_API_KEY) {
    throw new Error('GOOGLE_API_KEY environment variable is not set');
  }

  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    geminiModel = genAI.getGenerativeModel({ model: "gemini-2.0-pro-exp-02-05" });
  return geminiModel;
}

export async function queryGemini(
  messages: Array<{role: string, content: string}>,
  tools?: Tool[]
) {
  if (!geminiModel) {
    await initGemini();
  }

  try {
    const chat = geminiModel.startChat({
      generationConfig: {
        temperature: 0.7,
        topP: 0.8,
        topK: 40,
      },
      tools: tools?.map(tool => ({
        functionDeclarations: [{
          name: tool.name,
          description: tool.description(),
          parameters: tool.inputSchema
        }]
      }))
    });

    let lastResponse = '';

    // Process messages and handle tool calls
    for (const msg of messages) {
      if (msg.role === 'user') {
        const result = await chat.sendMessage(msg.content);
        const response = await result.response;
        lastResponse = response.text();

        // Handle tool calls if present
        if (response.candidates?.[0]?.content?.parts?.[0]?.functionCall) {
          const functionCall = response.candidates[0].content.parts[0].functionCall;
          const tool = tools?.find(t => t.name === functionCall.name);
          
          if (tool) {
            const toolResult = await tool.call(functionCall.args);
            // Send tool result back to chat
            const toolResponse = await chat.sendMessage(JSON.stringify(toolResult));
            lastResponse = (await toolResponse.response).text();
          }
        }
      }
    }

    return lastResponse;
  } catch (error) {
    console.error('Gemini API Error:', error);
    throw new Error(`Gemini Error: ${error.message}`);
  }
}