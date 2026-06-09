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
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content ?? '';
            if (text) controller.enqueue(encoder.encode(text));
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
