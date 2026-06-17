import { NextRequest } from 'next/server';
import { generateObject } from 'ai';
import { chatModel, hasApiKey } from '@/lib/ai';
import { suggestionsSchema } from '@/lib/schemas';

// My Day suggestions. The system prompt (built client-side in usePlans) asks the
// model to pick the tasks worth doing today; `generateObject` validates the reply
// against `suggestionsSchema` and we return the bare array to the client.
export async function POST(request: NextRequest) {
  if (!hasApiKey()) {
    return new Response('Missing config. Please set DEEPSEEK_API_KEY in .env.local.', { status: 500 });
  }

  const { messages, systemInstruction } = await request.json();

  try {
    const { object } = await generateObject({
      model: chatModel(),
      schema: suggestionsSchema,
      system: systemInstruction,
      messages,
    });
    return Response.json(object.suggestions);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[/api/suggestions] suggestion generation failed:', message);
    return new Response(`Suggestion generation failed: ${message}`, { status: 422 });
  }
}
