export const MACRO = {
  VERSION: process.env.npm_package_version ?? '0.0.0',
  README_URL: 'https://docs.anthropic.com/claude/docs',
  PACKAGE_URL: 'https://www.npmjs.com/package/@anthropic-ai/claude-code',
  // Add any other macro constants needed for the entire application
} as const
