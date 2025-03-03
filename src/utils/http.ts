/**
 * HTTP utility constants and helpers
 */

// WARNING: We rely on `claude-cli` in the user agent for log filtering.
// Please do NOT change this without making sure that logging also gets updated!
export const MACRO = {
    VERSION: process.env.npm_package_version ?? '0.0.0',
    // Add other macro constants here as needed
  }

export const USER_AGENT = `claude-cli/${MACRO.VERSION} (${process.env.USER_TYPE})`
