import type { ConnectorKind } from "@maindy/contracts";
import { CodeLine } from "@/components/ui/copy-button";

export const GATEWAY_BASE = "http://127.0.0.1:8787/v1";
export const GATEWAY_ROOT = "http://127.0.0.1:8787";

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[12.5px] font-medium text-muted">{title}</p>
      {children}
    </div>
  );
}

function Pre({ code }: { code: string }) {
  return (
    <pre className="m-scroll-thin overflow-x-auto rounded-[12px] border border-line bg-bg-deep/70 p-3 font-mono text-[12px] leading-relaxed text-muted">
      <code>{code}</code>
    </pre>
  );
}

/** Setup instructions per connector. Secrets are never typed here — they stay in the OS keychain or your env. */
export function ConnectorSetup({ kind }: { kind: ConnectorKind }) {
  switch (kind) {
    case "openai_api":
      return (
        <div className="flex flex-col gap-4">
          <Block title="1. Aponte o SDK/cliente para o gateway local">
            <CodeLine value={`OPENAI_BASE_URL=${GATEWAY_BASE}`} />
          </Block>
          <Block title="2. A chave continua sua">
            <p className="text-[13px] leading-relaxed text-subtle">
              Cadastre a chave no app maindy. (fica no Keychain do macOS / Credential Manager do Windows) ou continue enviando-a no header <code className="font-mono">Authorization</code> — o gateway repassa sem armazenar. A chave nunca é enviada para a nuvem maindy.
            </p>
          </Block>
          <Block title="Opcional: atribuição por projeto/agente">
            <Pre code={`x-maindy-project: api-checkout\nx-maindy-agent: agente-suporte`} />
          </Block>
        </div>
      );
    case "anthropic_api":
      return (
        <div className="flex flex-col gap-4">
          <Block title="1. Aponte o SDK Anthropic para o gateway (sem /v1 — o SDK acrescenta)">
            <CodeLine value={`ANTHROPIC_BASE_URL=${GATEWAY_ROOT}`} />
          </Block>
          <Block title="2. Credencial">
            <p className="text-[13px] leading-relaxed text-subtle">
              Use a sua <code className="font-mono">x-api-key</code> normalmente ou cadastre-a no app (Keychain). Os headers <code className="font-mono">anthropic-version</code> e <code className="font-mono">anthropic-beta</code> são repassados.
            </p>
          </Block>
        </div>
      );
    case "openai_compatible":
      return (
        <div className="flex flex-col gap-4">
          <Block title="Endpoint compatível (Ollama, vLLM, OpenRouter…)">
            <CodeLine value={`OPENAI_BASE_URL=${GATEWAY_BASE}`} />
          </Block>
          <Block title="Escolha o upstream por header">
            <Pre code={`x-maindy-upstream: ollama   # configurado no app: http://127.0.0.1:11434`} />
          </Block>
        </div>
      );
    case "local_agent_sdk":
      return (
        <div className="flex flex-col gap-4">
          <Block title="Agentes em TypeScript/Python, n8n e automações">
            <p className="text-[13px] leading-relaxed text-subtle">Qualquer cliente que aceite um endpoint customizado funciona. Troque a base URL e identifique o agente para ver a economia por agente.</p>
            <CodeLine value={GATEWAY_BASE} />
          </Block>
          <Block title="Exemplo (TypeScript, SDK OpenAI)">
            <Pre code={`const client = new OpenAI({\n  baseURL: "${GATEWAY_BASE}",\n  defaultHeaders: { "x-maindy-agent": "agente-suporte", "x-maindy-project": "api-checkout" },\n});`} />
          </Block>
        </div>
      );
    case "claude_code":
      return (
        <div className="flex flex-col gap-4">
          <Block title="1. Rode o instalador (com o app maindy. aberto)">
            <CodeLine value="maindy-claude-code install" />
          </Block>
          <Block title="O que ele configura — e o que não faz">
            <ul className="space-y-1.5 text-[13px] leading-relaxed text-subtle">
              <li>• Telemetria oficial OpenTelemetry (http/json) para o gateway local: uso, custo e tokens reportados pelo próprio Claude Code.</li>
              <li>• Status line para ler os limites oficiais (rate_limits) que o Claude Code expõe.</li>
              <li>• Hook PostToolUse para comprimir saídas verbosas de ferramentas, com fallback para a saída original.</li>
              <li>• Não lê nem reutiliza o login da sua assinatura e não registra prompts (OTEL_LOG_USER_PROMPTS fica desligado).</li>
            </ul>
          </Block>
          <Block title="Equivalente manual (variáveis de ambiente)">
            <Pre
              code={`CLAUDE_CODE_ENABLE_TELEMETRY=1\nOTEL_METRICS_EXPORTER=otlp\nOTEL_LOGS_EXPORTER=otlp\nOTEL_EXPORTER_OTLP_PROTOCOL=http/json\nOTEL_EXPORTER_OTLP_ENDPOINT=${GATEWAY_ROOT}`}
            />
          </Block>
        </div>
      );
    case "codex":
      return (
        <div className="flex flex-col gap-4">
          <Block title="Adicione ao ~/.codex/config.toml (a config de projeto ignora [otel])">
            <Pre code={`[otel]\nexporter = { otlp-http = { endpoint = "${GATEWAY_ROOT}/v1/logs", protocol = "json" } }\nlog_user_prompt = false`} />
          </Block>
          <Block title="Com API key (opcional): roteie pelo gateway">
            <Pre code={`[model_providers.maindy]\nname = "maindy gateway"\nbase_url = "${GATEWAY_BASE}"\nenv_key = "OPENAI_API_KEY"\nwire_api = "responses"`} />
          </Block>
          <p className="text-[12.5px] text-subtle">Login ChatGPT através de proxy não é documentado oficialmente — nesse caso, a maindy. oferece somente observabilidade.</p>
        </div>
      );
    case "chat_apps":
      return (
        <p className="text-[13px] leading-relaxed text-subtle">
          Claude e ChatGPT (web/desktop) não oferecem uma interface oficial para medir ou otimizar conversas de terceiros. A maindy. não intercepta tráfego, não lê cookies e não acessa seu histórico. O alcance aqui é parcial: dicas de uso e, quando houver API oficial, integração autorizada.
        </p>
      );
  }
}
