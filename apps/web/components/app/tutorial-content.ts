/** PT-BR video tutorial script + storyboard (recording pending) and the interactive tutorial steps. */

export const VIDEO_SCRIPT_DURATION = "≈ 2 min 10 s";

export const storyboard: { scene: string; time: string; visual: string; narration: string }[] = [
  {
    scene: "1. Instalação",
    time: "0:00 – 0:20",
    visual: "Página /app/download com o alvo detectado; clique em Baixar; DMG aberto e o app arrastado para Aplicativos (no Windows, o instalador). Destaque no SHA-256 e no selo de assinatura.",
    narration: "Em menos de um minuto você instala a maindy. Escolha o seu sistema, baixe o instalador e, se quiser, confira o SHA-256 — mostramos o status de assinatura do jeito que ele é.",
  },
  {
    scene: "2. Login e pareamento",
    time: "0:20 – 0:38",
    visual: "App abre o painel compacto e mostra um código XXXX-XXXX. No navegador, a página de aprovação exibe nome e plataforma do dispositivo; clique em Aprovar.",
    narration: "O app não pede sua senha. Ele mostra um código; você aprova no navegador, já logado. O token do dispositivo fica no Keychain e pode ser revogado a qualquer momento.",
  },
  {
    scene: "3. Conectar uma API (segredo oculto)",
    time: "0:38 – 1:00",
    visual: "Tela de conexões do app; colar a chave OpenAI em um campo mascarado (••••); o painel web mostra o conector como ‘Conectado — somente leitura’ e ‘Segredo em: Keychain’. Em seguida, OPENAI_BASE_URL apontando para 127.0.0.1:8787/v1.",
    narration: "Sua chave fica no cofre do sistema, nunca na nuvem maindy. Basta apontar o SDK para o gateway local — o resto do seu código continua igual.",
  },
  {
    scene: "4. Modo observação",
    time: "1:00 – 1:20",
    visual: "ORBIT em ‘Observar’; requisições reais aparecendo em ‘Últimas operações’ com selos ‘Reportado pelo provedor’ e ‘Medido localmente’.",
    narration: "Primeiro a gente só observa. Medimos custo, tokens e repetições reais para montar o baseline — sem mudar nenhuma requisição.",
  },
  {
    scene: "5. Ativar o ORBIT",
    time: "1:20 – 1:42",
    visual: "Troca para ‘Equilibrado’; ‘Simular antes de ativar’ lista as técnicas e o efeito esperado rotulado como estimativa; Confirmar.",
    narration: "Quando o baseline estiver pronto, ative o ORBIT. A simulação mostra o que muda antes de qualquer efeito, e o Quality Guard acompanha cada técnica.",
  },
  {
    scene: "6. Ver a economia",
    time: "1:42 – 1:58",
    visual: "Overview com Economia líquida, Tokens evitados, Custo real e o gráfico baseline × otimizado; abrir Relatórios e exportar CSV.",
    narration: "A economia aparece com a origem de cada número — e vira um relatório auditável, com IDs de evento e versão de preço.",
  },
  {
    scene: "7. Fallback e pausa",
    time: "1:58 – 2:10",
    visual: "Botão ‘Pausar tudo agora’; uma técnica revertida pelo Quality Guard com o motivo e o botão Reativar.",
    narration: "Se algo piorar, a técnica é revertida sozinha. E um clique pausa tudo: as requisições seguem originais. Você no controle.",
  },
];

export const tutorialSteps: { title: string; body: string; details: string[]; href?: string; cta?: string }[] = [
  {
    title: "Baixe e instale o app",
    body: "Escolha o instalador do seu sistema nesta página e confira o SHA-256 se quiser.",
    details: ["macOS: abra o .dmg e arraste a maindy. para Aplicativos.", "Windows: execute o instalador e siga as etapas.", "Se o app não for assinado, o sistema pede uma confirmação — veja as instruções acima."],
  },
  {
    title: "Pareie o dispositivo",
    body: "Ao abrir, o app mostra um código no formato XXXX-XXXX e abre o navegador na página de aprovação.",
    details: ["Confira nome e plataforma do dispositivo antes de aprovar.", "Nenhuma senha é digitada no app.", "Revogue dispositivos em Configurações → Dispositivos."],
    href: "/app/configuracoes",
    cta: "Ver dispositivos",
  },
  {
    title: "Conecte uma fonte",
    body: "API BYOK (OpenAI, Anthropic, compatíveis), Claude Code, Codex ou agentes locais.",
    details: ["A chave fica no Keychain/Credential Manager.", "Aponte o SDK para http://127.0.0.1:8787/v1.", "Claude Code: rode maindy-claude-code install."],
    href: "/app/conexoes",
    cta: "Abrir Integrações",
  },
  {
    title: "Meça o baseline (modo Observar)",
    body: "Deixe o gateway observar o uso real por alguns dias de trabalho normal.",
    details: ["Nada é alterado nas requisições.", "As operações aparecem no Overview com a origem de cada número."],
    href: "/app/orbit",
    cta: "Abrir ORBIT",
  },
  {
    title: "Ative o ORBIT",
    body: "Escolha Conservador ou Equilibrado, simule e confirme.",
    details: ["O Quality Guard amostra respostas e reverte técnicas com regressão.", "O botão Pausar faz fail-open imediato."],
    href: "/app/orbit",
    cta: "Configurar política",
  },
  {
    title: "Acompanhe e exporte",
    body: "Veja economia líquida, custo real e qualidade; exporte relatórios auditáveis.",
    details: ["CSV e PDF com IDs de evento, versão de preço e método.", "Toda economia é rotulada como estimativa contra baseline."],
    href: "/app/relatorios",
    cta: "Abrir Relatórios",
  },
];
