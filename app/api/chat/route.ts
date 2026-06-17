import { NextRequest } from 'next/server';
import { streamText } from 'ai';
import { chatModel, hasApiKey } from '@/lib/ai';

// Call 1 — the conversational reply. Streams Markdown text back to the client
// via the AI SDK's `streamText`. The system prompt is built client-side
// (buildChatInstruction) and passed through, so this route stays prompt-agnostic.
export async function POST(request: NextRequest) {
  if (!hasApiKey()) {
    return new Response('Missing config. Please set DEEPSEEK_API_KEY in .env.local.', { status: 500 });
  }

  const { messages, systemInstruction } = await request.json();

  try {
    const result = streamText({
      model: chatModel(),
      system: systemInstruction,
      messages,
      maxOutputTokens: 8192,
    });

    // Plain UTF-8 text stream — the client's existing reader loop consumes it as-is.
    return result.toTextStreamResponse();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[/api/chat] DeepSeek error:', message);
    return new Response(`API error: ${message}`, { status: 500 });
  }
}
