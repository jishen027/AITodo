import { NextRequest } from 'next/server';
import { streamObject } from 'ai';
import { chatModel, hasApiKey } from '@/lib/ai';
import { planDeltaSchema } from '@/lib/schemas';

// Call 2 — the plan delta. Uses `streamObject` so the schema-shaped JSON streams
// back as it is generated (this model can take 60s+ to build a rich plan). The
// progressive byte flow keeps the request alive end-to-end — a non-streaming
// generateObject sends nothing for ~a minute, which idle-timeout proxies and
// platform function limits happily kill, so the plan would silently never land.
// The schema still constrains the output; the client parses the final JSON text.
export async function POST(request: NextRequest) {
  if (!hasApiKey()) {
    return new Response('Missing config. Please set DEEPSEEK_API_KEY in .env.local.', { status: 500 });
  }

  const { messages, systemInstruction } = await request.json();

  const result = streamObject({
    model: chatModel(),
    schema: planDeltaSchema,
    system: systemInstruction,
    messages,
    maxOutputTokens: 8192,
    onError: ({ error }) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[/api/plan] plan generation failed:', message);
    },
  });

  // Streams the partial JSON object as text; the client accumulates it and
  // parses the final object (a malformed/incomplete result fails to parse there
  // and surfaces as an honest "couldn't generate" message).
  return result.toTextStreamResponse();
}
