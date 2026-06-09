export interface ApiMessage {
  role: 'user' | 'assistant';
  content: string;
}

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

export async function callChat(
  messages: ApiMessage[],
  systemInstruction: string
): Promise<string> {
  return callChatStream(messages, systemInstruction, () => {});
}
