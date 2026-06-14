import { NextRequest } from 'next/server';
import OpenAI from 'openai';

export async function POST(request: NextRequest) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const model = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat';

  if (!apiKey) {
    return new Response('Missing config. Please set DEEPSEEK_API_KEY in .env.local.', { status: 500 });
  }

  const { messages, systemInstruction } = await request.json();

  const client = new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com' });

  try {
    const stream = await client.chat.completions.create({
      model,
      messages: [{ role: 'system', content: systemInstruction }, ...messages],
      stream: true,
      max_tokens: 8192,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        let finishReason: string | null = null;
        try {
          for await (const chunk of stream) {
            const choice = chunk.choices[0];
            const text = choice?.delta?.content ?? '';
            if (text) controller.enqueue(encoder.encode(text));
            if (choice?.finish_reason) finishReason = choice.finish_reason;
          }
          // The model hit the output token cap and stopped mid-response (e.g. an
          // unclosed JSON block). Emit a sentinel so the client fails loudly
          // instead of silently parsing a half-finished plan.
          if (finishReason === 'length') {
            controller.enqueue(encoder.encode('<<<TRUNCATED>>>'));
          }
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[/api/chat] DeepSeek error:', message);
    return new Response(`API error: ${message}`, { status: 500 });
  }
}
