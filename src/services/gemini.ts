import { GoogleGenerativeAI } from '@google/generative-ai';

let geminiClient: GoogleGenerativeAI | null = null;

export function getGeminiClient(): GoogleGenerativeAI {
  if (geminiClient) {
    return geminiClient;
  }

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY environment variable is required');
  }

  geminiClient = new GoogleGenerativeAI(apiKey);
  return geminiClient;
}

export function resetGeminiClient(): void {
  geminiClient = null;
}

export async function generateResponse(prompt: string) {
  const client = getGeminiClient();
  const model = client.getGenerativeModel({ model: 'gemini-pro' });
  const result = await model.generateContent(prompt);
  return result.response.text();
}