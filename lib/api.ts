export interface ApiMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function callChat(
  messages: ApiMessage[],
  systemInstruction: string
): Promise<string> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, systemInstruction }),
  });

  if (!response.ok) return 'Sorry, there was a connection error. Please try again.';

  const data = await response.json();
  return data.text || 'AI could not respond. Please try again.';
}
