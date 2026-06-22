import { createDeepSeek } from '@ai-sdk/deepseek';

// Server-only DeepSeek provider. Centralises the API-key / model config that
// every AI route shares, keeping the same DEEPSEEK_API_KEY / DEEPSEEK_MODEL env
// contract the app used with the raw OpenAI SDK.
const deepseek = createDeepSeek({ apiKey: process.env.DEEPSEEK_API_KEY ?? '' });

export function chatModel() {
  return deepseek(process.env.DEEPSEEK_MODEL ?? 'deepseek-chat');
}

export function hasApiKey() {
  return !!process.env.DEEPSEEK_API_KEY;
}
