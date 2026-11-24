// All settings come from environment variables. Nothing secret lives in code.
// Every integration is optional: with none configured, the server runs in
// demo mode with sample data, so the app works end to end out of the box.

function env(name: string, fallback = ''): string {
  return process.env[name]?.trim() || fallback
}

export const config = {
  port: Number(env('PORT', '8787')),
  /** Public base URL of this server, used for OAuth redirects and the pairing link. */
  publicUrl: env('PUBLIC_URL', 'http://localhost:8787').replace(/\/$/, ''),
  /** Where the JSON store lives. Mount a volume here in production. */
  dataFile: env('DATA_FILE', './data/store.json'),
  /** Origins allowed to call the API (the glasses WebView and the simulator). */
  corsOrigins: env('CORS_ORIGINS', '*'),

  google: {
    clientId: env('GOOGLE_CLIENT_ID'),
    clientSecret: env('GOOGLE_CLIENT_SECRET'),
  },
  telegram: {
    apiId: Number(env('TELEGRAM_API_ID', '0')),
    apiHash: env('TELEGRAM_API_HASH'),
  },
  /** Any OpenAI-compatible chat API: OpenRouter (default), Orbio, OpenAI, Groq… */
  llm: {
    apiKey: env('LLM_API_KEY') || env('OPENROUTER_API_KEY'),
    baseUrl: env('LLM_BASE_URL', 'https://openrouter.ai/api/v1'),
    model: env('LLM_MODEL', 'openai/gpt-4o-mini'),
  },
  /** Speech-to-text: any OpenAI-compatible /audio/transcriptions endpoint (OpenAI, Groq, a self-hosted Whisper). */
  stt: {
    apiKey: env('STT_API_KEY'),
    baseUrl: env('STT_BASE_URL', 'https://api.groq.com/openai/v1'),
    model: env('STT_MODEL', 'whisper-large-v3-turbo'),
    /** Or transcribe with an audio-capable chat model on the LLM provider (e.g. Orbio), no separate key. */
    chatModel: env('STT_CHAT_MODEL'),
  },
  /** Seconds an approved action waits before it runs, so the user can undo it. */
  undoSeconds: Number(env('UNDO_SECONDS', '10')),
}

export const hasGoogle = () => Boolean(config.google.clientId && config.google.clientSecret)
export const hasTelegram = () => Boolean(config.telegram.apiId && config.telegram.apiHash)
export const hasLlm = () => Boolean(config.llm.apiKey)
export const hasStt = () => Boolean(config.stt.apiKey || (config.stt.chatModel && config.llm.apiKey))
