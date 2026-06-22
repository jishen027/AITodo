import { createDeepSeek } from '@ai-sdk/deepseek';

// Server-only DeepSeek provider. Centralises the API-key / model config that
// every AI route shares, keeping the same DEEPSEEK_API_KEY / DEEPSEEK_MODEL env
// contract the app used with the raw OpenAI SDK.
const deepseek = createDeepSeek({ apiKey: process.env.DEEPSEEK_API_KEY ?? '' });

export function chatModel() {
  // structuredOutputs: false tells the SDK that this model doesn't support the
  // native response_format JSON schema API, so it goes straight to injecting the
  // schema into the system prompt (compatibility mode) without logging a warning.
  return deepseek(process.env.DEEPSEEK_MODEL ?? 'deepseek-chat', { structuredOutputs: false });
}

export function hasApiKey() {
  return !!process.env.DEEPSEEK_API_KEY;
}
