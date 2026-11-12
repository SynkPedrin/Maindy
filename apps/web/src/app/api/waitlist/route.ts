import { NextResponse, type NextRequest } from 'next/server';
import { getWaitlistAdapter } from '@/lib/waitlist/adapter';
import { POLICY_VERSION, publicEnv } from '@/lib/env';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { waitlistSchema } from '@/lib/validation';

export async function POST(request: NextRequest) {
  // Só aceita chamadas da própria origem.
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(publicEnv.siteUrl).origin) {
    return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403 });
  }
  if (!rateLimit(`waitlist:${clientIp(request.headers)}`, 5, 60_000)) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde um instante.' }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  const parsed = waitlistSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    // honeypot preenchido: responde como sucesso sem gravar nada (não ajuda o bot a aprender)
    if (issue?.path[0] === 'company') return NextResponse.json({ status: 'created' });
    return NextResponse.json({ error: issue?.message ?? 'Dados inválidos.', field: issue?.path[0] }, { status: 422 });
  }

  const { name, email, platform, mainExpectation, consent } = parsed.data;
  const entry = { name, email, platform, mainExpectation, consent };
  const result = await getWaitlistAdapter().add(entry, { policyVersion: POLICY_VERSION, source: 'landing' });

  switch (result.status) {
    case 'created':
      return NextResponse.json({ status: 'created' }, { status: 201 });
    case 'duplicate':
      return NextResponse.json({ status: 'duplicate' }, { status: 200 });
    case 'unavailable':
      return NextResponse.json(
        { error: 'As inscrições estão temporariamente indisponíveis. Tente novamente mais tarde.' },
        { status: 503 },
      );
    default:
      return NextResponse.json({ error: 'Não foi possível concluir sua inscrição. Tente novamente.' }, { status: 500 });
  }
}
