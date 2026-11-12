// Supabase Edge Function: text embeddings with the built-in gte-small model (384 dims),
// used by the MAINDY API when it runs serverless (Vercel) and can't host a local model.
// Only callable with the service-role key (the API sends it; clients never call this).

// @ts-expect-error Supabase Edge Runtime global
const session = new Supabase.ai.Session('gte-small');

Deno.serve(async (req: Request) => {
  const auth = req.headers.get('authorization') ?? '';
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!service || auth !== `Bearer ${service}`) return new Response('forbidden', { status: 403 });
  const { texts } = (await req.json()) as { texts?: string[] };
  if (!Array.isArray(texts) || texts.length === 0 || texts.length > 32) return new Response('bad request', { status: 400 });
  const vectors: number[][] = [];
  for (const t of texts) vectors.push((await session.run(String(t).slice(0, 4000), { mean_pool: true, normalize: true })) as number[]);
  return Response.json({ model: 'gte-small', dimensions: 384, vectors });
});
