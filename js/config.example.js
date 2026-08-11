// Copy this file to config.js and replace only the public browser values.
// Static GitHub Pages assets are public: never put a secret/service-role key,
// database password, or personal access token here.
export const SUPABASE_CONFIG = Object.freeze({
  enabled: false,
  url: "https://YOUR_PROJECT_REF.supabase.co",
  publishableKey: "YOUR_SUPABASE_PUBLISHABLE_KEY",
  requestTimeoutMs: 8_000,
  maxRetries: 1,
});
