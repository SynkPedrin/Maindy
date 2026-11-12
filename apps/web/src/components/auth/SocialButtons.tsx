interface SocialButtonsProps {
  intent: 'login' | 'signup';
  enabled: { google: boolean; github: boolean };
  /** Para cadastro: só libera depois que o usuário marcou os consentimentos. */
  consentGiven?: boolean;
}

const GoogleIcon = () => (
  <svg aria-hidden viewBox="0 0 24 24" className="size-5">
    <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" />
    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z" />
    <path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z" />
    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z" />
  </svg>
);

const GitHubIcon = () => (
  <svg aria-hidden viewBox="0 0 24 24" className="size-5 fill-white">
    <path d="M12 .5C5.7.5.5 5.7.5 12a11.5 11.5 0 0 0 7.9 10.9c.6.1.8-.25.8-.56v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.4 11.4 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A11.5 11.5 0 0 0 23.5 12C23.5 5.7 18.3.5 12 .5z" />
  </svg>
);

const providers = [
  { id: 'google', label: 'Google', Icon: GoogleIcon },
  { id: 'github', label: 'GitHub', Icon: GitHubIcon },
] as const;

/** Botões de login social. Cada um é um POST para /auth/oauth (PKCE no servidor). */
export function SocialButtons({ intent, enabled, consentGiven = true }: SocialButtonsProps) {
  const verb = intent === 'signup' ? 'Cadastrar com' : 'Entrar com';
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {providers.map(({ id, label, Icon }) => {
        const available = enabled[id];
        const disabled = !available || !consentGiven;
        return (
          <form key={id} action="/auth/oauth" method="post">
            <input type="hidden" name="provider" value={id} />
            <input type="hidden" name="intent" value={intent} />
            {intent === 'signup' && consentGiven && (
              <>
                <input type="hidden" name="terms" value="on" />
                <input type="hidden" name="privacy" value="on" />
                <input type="hidden" name="aiProcessing" value="on" />
              </>
            )}
            <button
              type="submit"
              disabled={disabled}
              title={!available ? `Acesso com ${label} ainda não configurado neste ambiente` : undefined}
              className="flex h-12 w-full items-center justify-center gap-2.5 rounded-2xl border border-line bg-white/[0.04] text-sm font-medium text-white transition-[background-color,border-color,transform] duration-200 hover:border-white/25 hover:bg-white/[0.08] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Icon />
              <span>
                {verb} {label}
              </span>
            </button>
          </form>
        );
      })}
      {(!enabled.google || !enabled.github) && (
        <p className="text-[12.5px] text-muted sm:col-span-2">
          {!enabled.google && !enabled.github
            ? 'Acesso com Google e GitHub em configuração. Use e-mail e senha por enquanto.'
            : `Acesso com ${!enabled.google ? 'Google' : 'GitHub'} em configuração.`}
        </p>
      )}
    </div>
  );
}

export function Divider({ children = 'ou' }: { children?: React.ReactNode }) {
  return (
    <div className="my-6 flex items-center gap-4 text-xs uppercase tracking-[0.16em] text-muted">
      <span className="hairline flex-1" />
      {children}
      <span className="hairline flex-1" />
    </div>
  );
}
