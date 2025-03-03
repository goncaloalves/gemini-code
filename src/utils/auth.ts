import { USE_BEDROCK, USE_VERTEX } from './model.js'
import { getGlobalConfig } from './config.js'

export function isAnthropicAuthEnabled(): boolean {
  return !(USE_BEDROCK || USE_VERTEX)
}

export function isLoggedInToAnthropic(): boolean {
  const config = getGlobalConfig()
  return !!config.primaryApiKey
}

export function isGoogleAuthEnabled(): boolean {
  return !!process.env.GOOGLE_API_KEY;
}

