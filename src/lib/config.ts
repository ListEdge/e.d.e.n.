/**
 * Central place Eden reads its environment from.
 * Nothing else in the codebase touches process.env directly.
 */
export const config = {
  ai: {
    preferred: (process.env.EDEN_AI_PROVIDER ?? "auto").toLowerCase(),
    anthropicKey: process.env.ANTHROPIC_API_KEY ?? "",
    openaiKey: process.env.OPENAI_API_KEY ?? "",
    googleKey: process.env.GOOGLE_API_KEY ?? "",
  },
  database: {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  },
  search: {
    tavilyKey: process.env.TAVILY_API_KEY ?? "",
  },
  email: {
    resendKey: process.env.RESEND_API_KEY ?? "",
    from: process.env.EDEN_EMAIL_FROM ?? "",
  },
  realtime: {
    model: process.env.EDEN_REALTIME_MODEL ?? "gpt-realtime",
    voice: process.env.EDEN_REALTIME_VOICE ?? "marin",
  },
  identity: {
    userTitle: process.env.EDEN_USER_TITLE ?? "Sir",
    ownerName: process.env.EDEN_OWNER_NAME ?? "",
    ownerLocation: process.env.EDEN_OWNER_LOCATION ?? "Christchurch, New Zealand",
  },
};
