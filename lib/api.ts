import type { PlanDelta, Suggestion } from '@/lib/schemas';

export interface ApiMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Call 1 — stream the conversational reply. The server returns a plain UTF-8
// text stream (AI SDK `toTextStreamResponse`), so the reader loop is unchanged.
export async function callChatStream(
  messages: ApiMessage[],
  systemInstruction: string,
  onChunk: (chunk: string) => void
): Promise<string> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, systemInstruction }),
  });

  if (!response.ok || !response.body) {
    return 'Sorry, there was a connection error. Please try again.';
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    fullText += chunk;
    onChunk(chunk);
  }

  return fullText;
}

// Call 2 — generate the plan delta. The server streams the schema-shaped JSON as
// it is produced (`streamObject`), so we read the whole text stream and parse the
// final object. Streaming keeps the (often 60s+) request alive with a continuous
// byte flow; a malformed/incomplete payload throws on parse and the caller shows
// an honest fallback. An optional `onProgress` receives the partial JSON text.
export async function generatePlanDelta(
  messages: ApiMessage[],
  systemInstruction: string,
  onProgress?: (partialText: string) => void
): Promise<PlanDelta> {
  const response = await fetch('/api/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, systemInstruction }),
  });
  if (!response.ok || !response.body) {
    throw new Error(`Plan generation failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    onProgress?.(text);
  }

  return JSON.parse(text) as PlanDelta;
}

// My Day suggestions — validated, typed JSON array.
export async function generateSuggestions(
  messages: ApiMessage[],
  systemInstruction: string
): Promise<Suggestion[]> {
  const response = await fetch('/api/suggestions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, systemInstruction }),
  });
  if (!response.ok) {
    throw new Error(`Suggestion generation failed: ${response.status}`);
  }
  return response.json();
}
