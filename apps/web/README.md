# @maindy/web: landing page + login/cadastro

Next.js 15 (App Router) com TypeScript strict, Tailwind 4, Motion, React Hook Form e Zod. A autenticação usa o mesmo Supabase do sistema MAINDY.

## Rodar localmente

```bash
pnpm install                       # na raiz do monorepo
pnpm db:start                      # Supabase local (se ainda não estiver no ar)
pnpm --filter @maindy/web dev      # http://localhost:3100
```

Copie `.env.example` para `.env.local`. As chaves do Supabase local aparecem em `pnpm db:status`.

| Variável | Onde é usada |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | URL pública da LP (callbacks de OAuth e e-mail, SEO) |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Login e cadastro |
| `SUPABASE_SERVICE_ROLE_KEY` | Só no servidor, para gravar a lista de espera. Sem ela, o formulário responde 503 e **não** simula sucesso |
| `NEXT_PUBLIC_MAINDY_APP_URL` | Sistema que recebe a sessão após o login |
| `MAINDY_POLICY_VERSION` | Versão dos Termos e da Política. Se mudar, o consentimento é pedido de novo |

## Fluxo de acesso

1. `/cadastro` exige três consentimentos LGPD separados (termos, privacidade, processamento por IA) antes de liberar o e-mail, o Google ou o GitHub.
2. Google e GitHub passam por `POST /auth/oauth`, com PKCE no servidor, e voltam em `/auth/callback`. O consentimento dado antes do redirecionamento é gravado em `maindy.consents` pela RPC `public.record_web_consent`.
3. Quem entra sem consentimento vigente (por exemplo, login social de uma conta antiga) passa por `/consentimento`.
4. `/auth/continuar` entrega a sessão ao sistema em `<APP_URL>/auth/callback#access_token=…&refresh_token=…&expires_in=…&token_type=bearer&type=login|signup` e apaga os cookies da LP **sem** `signOut`, porque `signOut` revogaria a sessão que acabou de ser entregue.

## Ativar Google e GitHub

Callback para cadastrar nos dois provedores: `http://localhost:54321/auth/v1/callback` (em produção, `https://<projeto>.supabase.co/auth/v1/callback`).

- **Google:** Google Cloud Console → APIs e serviços → Credenciais → Criar ID do cliente OAuth → Aplicativo da Web. Em "URIs de redirecionamento autorizados", use o callback acima. Configure também a tela de consentimento OAuth.
- **GitHub:** Settings → Developer settings → OAuth Apps → New OAuth App. Homepage `http://localhost:3100`, Authorization callback URL = o callback acima.

Depois:

1. Copie `supabase/.env.example` para `supabase/.env` e preencha os quatro valores.
2. Em `supabase/config.toml`, mude `enabled = false` para `true` em `[auth.external.google]` e em `[auth.external.github]`.
3. Rode `pnpm db:stop && pnpm db:start` (sem reset). Os botões são liberados sozinhos, porque a LP lê `/auth/v1/settings`.

## Hero em vídeo (Remotion)

A hero abre com `maindy-intro-1080.mp4` (MAINDY_INTRO) e emenda, sem corte, em `orb-loop-1080.mp4`. O último quadro da intro é idêntico ao primeiro quadro do loop. Os vídeos são gerados em `apps/brand-video`:

```bash
pnpm --filter @maindy/brand-video studio   # editar e pré-visualizar
pnpm --filter @maindy/brand-video render   # renderiza e copia para public/assets/maindy/animations
```

Se o autoplay estiver bloqueado ou a pessoa preferir menos movimento, a hero mostra `hero-poster.jpeg` e o texto na hora.

## Ilustrações

As ilustrações de `public/assets/maindy/illustrations` foram geradas com o Codex (gpt-5.6-sol, geração de imagem). Os PNGs originais e o prompt usado estão em `design/asset-src/codex-generated/`.

## Qualidade

```bash
pnpm --filter @maindy/web typecheck
pnpm --filter @maindy/web lint
pnpm --filter @maindy/web test     # unitários (Vitest)
pnpm --filter @maindy/web build
```

## Produção

- Configure as variáveis no provedor de hospedagem (Vercel ou outro). `SUPABASE_SERVICE_ROLE_KEY` nunca pode ter prefixo `NEXT_PUBLIC_`.
- No Supabase de produção: aplique as migrations, inclua a URL da LP em Auth → URL Configuration → Redirect URLs e ative os provedores com as credenciais de produção.
- O limitador de requisições é em memória. Com várias instâncias, troque por um store compartilhado (por exemplo, Redis).
- Os textos de `/privacidade` e `/termos` são uma base honesta para o acesso antecipado e precisam de revisão jurídica antes do lançamento público, incluindo o canal do encarregado de dados (DPO).
