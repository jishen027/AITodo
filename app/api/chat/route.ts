import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export async function POST(request: NextRequest) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const model = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat';

  if (!apiKey) {
    return NextResponse.json(
      { text: 'Missing config. Please set DEEPSEEK_API_KEY in .env.local.' },
      { status: 500 }
    );
  }

  const { messages, systemInstruction } = await request.json();

  const client = new OpenAI({
    apiKey,
    baseURL: 'https://api.deepseek.com',
  });

  try {
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemInstruction },
        ...messages,
      ],
    });

    const text = completion.choices[0]?.message?.content ?? 'AI could not respond. Please try again.';
    return NextResponse.json({ text });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[/api/chat] DeepSeek error:', message);
    return NextResponse.json({ text: `API error: ${message}` }, { status: 500 });
  }
}
