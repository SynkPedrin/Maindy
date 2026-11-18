import { AppWindow, Bot, Check, Code2, Copy, FlaskConical, KeyRound, Loader2, MessageSquareOff, Plug, Power, RefreshCw, Send, ShieldCheck, Sparkles, Terminal, Unplug } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { bridge } from "../../bridge";
import { useAction, useApp, useOps, useResource, type Dash, type Resource } from "../../data";
import { timedLocally } from "../../sources";
import type { Focus } from "../MainWindow";
import type {
  AgentSetup,
  AgentTarget,
  ConnectorDto,
  GatewayUpstream,
  IntegrationApplyResult,
  IntegrationTool,
  ProbeView,
  ToolIntegrations,
  UpstreamKind,
  UpstreamTest,
} from "../../types";
import { ActionMsg, Btn, Check2, CodeBlock, ConnectorStatus, SourceBadge, ago, copyText, cx, money, tokens } from "../../ui";

const capLabel: Record<keyof ConnectorDto["capabilities"], string> = {
  observeUsage: "Uso",
  observeCost: "Custo",
  officialQuota: "Cota oficial",
  cache: "Cache",
  compression: "Compressão",
  routing: "Roteamento",
  qualityGuard: "Quality Guard",
};
const levelLabel = { supported: "suportado", partial: "parcial", planned: "planejado", not_supported: "não suportado" } as const;

export function normKind(k: string): UpstreamKind {
  if (k === "openai" || k === "openai_api") return "openai";
  if (k === "anthropic" || k === "anthropic_api") return "anthropic";
  return "openai_compatible";
}

/* ------------------------------------------------------------------------------------------ */

export function Integrations({ d, focus = null }: { d: Dash; focus?: Focus }) {
  const { gateway, boot } = useApp();
  const ops = useOps();
  const ups = useResource(() => ops.gatewayUpstreams(), [ops, gateway.healthy]);
  const tools = useResource(() => ops.integrationsGet(), [ops, gateway.healthy]);
  const conn = (k: ConnectorDto["kind"]) => d.connectors.data?.find((c) => c.kind === k);
  const list = ups.data?.upstreams ?? [];
  const upstreamOf = (k: UpstreamKind) => list.find((u) => normKind(u.kind) === k);
  const compat = list.filter((u) => normKind(u.kind) === "openai_compatible");
  const refresh = async () => {
    await Promise.all([ups.reload(), tools.reload(), d.reload()]);
  };
  // maindy://integrations/<kind>: the targeted card opens its form/flow (nonce) and is scrolled into view
  const fx = (k: ConnectorDto["kind"]) => (focus?.connector === k ? focus.nonce : 0);
  useEffect(() => {
    if (!focus) return;
    const reduce = document.documentElement.classList.contains("reduce-motion") || !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // cards above grow when their data arrives, so align twice: right away and after the first loads
    const align = (smooth: boolean) => {
      const el = document.getElementById(`conn-${focus.connector}`);
      const box = el?.closest(".content-body");
      if (!el || !box) return el;
      box.scrollTo({ top: box.scrollTop + el.getBoundingClientRect().top - box.getBoundingClientRect().top - 14, behavior: smooth && !reduce ? "smooth" : "auto" });
      return el;
    };
    const t1 = window.setTimeout(() => {
      const el = align(true);
      el?.classList.add("icard-focus");
      window.setTimeout(() => el?.classList.remove("icard-focus"), 2600);
    }, 120);
    const t2 = window.setTimeout(() => align(false), 750);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [focus]);

  return (
    <div className="stack integrations">
      <GatewayBanner />
      {d.connectors.error && <p className="error-line">Status das integrações indisponível: {d.connectors.error}</p>}

      <SectionTitle icon={<KeyRound size={15} />} title="Provedores de API" sub="Sua chave fica no Keychain deste Mac e só vive na memória do gateway local. A nuvem da maindy guarda apenas a referência." />
      <ProviderCard id="openai" kind="openai_api" title="OpenAI API" connector={conn("openai_api")} upstream={upstreamOf("openai")} upLoading={ups.loading && !ups.data} upError={ups.error} onChanged={refresh} focusNonce={fx("openai_api")} />
      <ProviderCard id="anthropic" kind="anthropic_api" title="Anthropic API" connector={conn("anthropic_api")} upstream={upstreamOf("anthropic")} upLoading={ups.loading && !ups.data} upError={ups.error} onChanged={refresh} focusNonce={fx("anthropic_api")} />
      {compat.length > 0 ? (
        compat.map((u, i) => <CompatCard key={u.id} upstream={u} connector={conn("openai_compatible")} onChanged={refresh} anchor={i === 0} focusNonce={i === 0 ? fx("openai_compatible") : 0} />)
      ) : (
        <CompatCard upstream={null} connector={conn("openai_compatible")} onChanged={refresh} anchor focusNonce={fx("openai_compatible")} />
      )}

      <SectionTitle icon={<Code2 size={15} />} title="Agentes e SDKs" sub="Qualquer código que fale a API da OpenAI ou da Anthropic pode passar pelo gateway local." />
      <SdkCard connector={conn("local_agent_sdk")} gatewayUrl={boot.gatewayUrl} hasUpstream={list.some((u) => u.hasCredential || normKind(u.kind) === "openai_compatible")} onChanged={refresh} />

      <SectionTitle icon={<Terminal size={15} />} title="Ferramentas de código" sub="Instalação na configuração local da ferramenta, com prévia das mudanças e backup antes de gravar." />
      <ToolCard tool="claude-code" connector={conn("claude_code")} res={tools} onChanged={refresh} focusNonce={fx("claude_code")} />
      <ToolCard tool="codex" connector={conn("codex")} res={tools} onChanged={refresh} focusNonce={fx("codex")} />

      <SectionTitle icon={<MessageSquareOff size={15} />} title="Apps de chat" />
      <ChatAppsCard connector={conn("chat_apps")} />
    </div>
  );
}

function SectionTitle({ icon, title, sub }: { icon: ReactNode; title: string; sub?: string }) {
  return (
    <div className="sec-title">
      <h2>
        <span aria-hidden>{icon}</span>
        {title}
      </h2>
      {sub && <p>{sub}</p>}
    </div>
  );
}

function GatewayBanner() {
  const { gateway, boot, reload, demo } = useApp();
  const act = useAction();
  if (gateway.healthy) return null;
  const canEnable = gateway.installed && !boot.settings.gatewayLocal && !demo;
  return (
    <div className="gw-banner" role="status">
      <Power size={16} aria-hidden />
      <div>
        <strong>{gateway.phase === "starting" ? "Gateway local iniciando…" : "Gateway local desligado"}</strong>
        <p>Salvar chaves, testar provedores e instalar integrações dependem do gateway local em {boot.gatewayUrl}.</p>
        <ActionMsg s={act} />
      </div>
      {canEnable ? (
        <Btn kind="primary" size="sm" busy={act.busy} onClick={() => void act.run(async () => (await bridge().gatewaySetEnabled(true), await reload()), "Gateway local ativado.")}>
          Ativar gateway local
        </Btn>
      ) : (
        !gateway.installed && <span className="muted">Gateway não instalado nesta versão do app.</span>
      )}
    </div>
  );
}

function Caps({ c }: { c: ConnectorDto | undefined }) {
  if (!c) return null;
  return (
    <ul className="caps" aria-label="O que a maindy faz aqui">
      {(Object.keys(capLabel) as Array<keyof ConnectorDto["capabilities"]>).map((k) => (
        <li key={k} className={`cap-${c.capabilities[k]}`} title={`${capLabel[k]}: ${levelLabel[c.capabilities[k]]}`}>
          {capLabel[k]}
          <span className="sr-only">: {levelLabel[c.capabilities[k]]}</span>
        </li>
      ))}
    </ul>
  );
}

function Limitations({ c }: { c: ConnectorDto | undefined }) {
  if (!c || c.limitations.length === 0) return null;
  return (
    <details className="limits-d">
      <summary>Limitações ({c.limitations.length})</summary>
      <ul>
        {c.limitations.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </details>
  );
}

function IntegrationCard({ icon, title, connector, children, aside, anchor }: { icon: ReactNode; title: string; connector: ConnectorDto | undefined; children: ReactNode; aside?: ReactNode; anchor?: ConnectorDto["kind"] }) {
  return (
    <section id={anchor ? `conn-${anchor}` : undefined} className={cx("card", "icard", connector && `cs-${connector.status}`)} aria-label={title}>
      <header className="icard-h">
        <span className="icard-ico" aria-hidden>
          {icon}
        </span>
        <div className="icard-title">
          <h3>{title}</h3>
          {connector && <p>{connector.description}</p>}
        </div>
        <ConnectorStatus c={connector} />
      </header>
      <div className="icard-body">
        <div className="icard-main">{children}</div>
        {aside && <aside className="icard-aside">{aside}</aside>}
      </div>
    </section>
  );
}

/* ------------------------------ provider keys ------------------------------ */

function credentialLine(u: GatewayUpstream | undefined, stored: boolean, gwUp: boolean): { tone: "ok" | "warn" | "idle"; text: string } {
  if (stored && u?.credentialSource === "memory") return { tone: "ok", text: "Chave no Keychain · ativa no gateway" };
  if (stored && !gwUp) return { tone: "warn", text: "Chave no Keychain · gateway desligado" };
  if (stored) return { tone: "warn", text: "Chave no Keychain · ainda não enviada ao gateway" };
  if (u?.credentialSource === "env") return { tone: "ok", text: "Chave lida de variável de ambiente do gateway" };
  if (u?.credentialSource === "memory") return { tone: "ok", text: "Chave ativa no gateway (definida fora deste app)" };
  return { tone: "idle", text: "Nenhuma chave configurada" };
}

function KeyForm({ id, label, onSaved, onCancel, optional }: { id: string; label: string; onSaved: () => void; onCancel?: () => void; optional?: boolean }) {
  const ops = useOps();
  const [value, setValue] = useState("");
  const act = useAction();
  const fid = useId();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const k = value;
    setValue(""); // the key leaves the webview state before the call; it is never shown again
    const r = await act.run(() => ops.providerKeySave(id, k), (v) => (v.pushed ? "Chave salva no Keychain e enviada ao gateway." : (v.pushError ?? "Chave salva no Keychain.")));
    if (r) onSaved();
  };
  return (
    <form className="key-form" onSubmit={(e) => void submit(e)}>
      <label htmlFor={fid}>{label}</label>
      <div className="field-row">
        <input
          id={fid}
          type="password"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder={optional ? "opcional" : "cole a chave aqui"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-describedby={`${fid}-h`}
          autoFocus
        />
        <Btn type="submit" kind="primary" busy={act.busy} disabled={value.trim().length === 0} icon={<ShieldCheck size={14} aria-hidden />}>
          Salvar no Keychain
        </Btn>
        {onCancel && (
          <Btn kind="ghost" onClick={onCancel} disabled={act.busy}>
            Cancelar
          </Btn>
        )}
      </div>
      <span className="field-hint" id={`${fid}-h`}>
        Enviada uma única vez ao núcleo nativo do app, que a guarda no Keychain (serviço <code>maindy</code>, conta <code>provider:{id}</code>). Ela não volta para esta tela, não vai para logs nem para a nuvem.
      </span>
      <ActionMsg s={act} />
    </form>
  );
}

function TestResult({ t, extra }: { t: UpstreamTest; extra?: ReactNode }) {
  const [all, setAll] = useState(false);
  if (!t.ok)
    return (
      <div className="test-res test-bad" role="alert">
        <strong>Falha no teste</strong>
        <span>{t.error?.message ?? "O provedor não respondeu."}</span>
        {t.error?.code && <code>{t.error.code}</code>}
      </div>
    );
  const models = all ? t.models : t.models.slice(0, 10);
  return (
    <div className="test-res test-ok" role="status">
      <div className="test-top">
        <strong>Conexão OK</strong>
        <span>
          {t.latencyMs != null ? `${t.latencyMs.toLocaleString("pt-BR")} ms` : "latência indisponível"} <SourceBadge source={timedLocally(t.latencyMs)} compact />
        </span>
        <span>{t.models.length.toLocaleString("pt-BR")} modelos disponíveis</span>
      </div>
      {t.models.length > 0 && (
        <ul className="models" aria-label="Modelos disponíveis">
          {models.map((m) => (
            <li key={m}>
              <code>{m}</code>
            </li>
          ))}
          {t.models.length > 10 && (
            <li>
              <button type="button" className="link" onClick={() => setAll((x) => !x)}>
                {all ? "mostrar menos" : `+${t.models.length - 10} modelos`}
              </button>
            </li>
          )}
        </ul>
      )}
      {extra}
    </div>
  );
}

function ProviderCard({
  id,
  kind,
  title,
  connector,
  upstream,
  upLoading,
  upError,
  onChanged,
  focusNonce = 0,
}: {
  id: string;
  kind: "openai_api" | "anthropic_api";
  title: string;
  connector: ConnectorDto | undefined;
  upstream: GatewayUpstream | undefined;
  upLoading: boolean;
  upError: string | null;
  onChanged: () => Promise<void>;
  focusNonce?: number;
}) {
  const { boot, gateway, reload } = useApp();
  const ops = useOps();
  const upId = upstream?.id ?? id;
  const stored = boot.settings.providerKeys.includes(upId);
  const hasKey = stored || !!upstream?.hasCredential;
  const [mode, setMode] = useState<"idle" | "form" | "confirm">("idle");
  const [test, setTest] = useState<{ t: UpstreamTest; note: string | null } | null>(null);
  const testAct = useAction();
  const delAct = useAction();
  const syncAct = useAction();
  const cred = credentialLine(upstream, stored, gateway.healthy);
  useEffect(() => {
    if (focusNonce && !hasKey) setMode("form"); // deep link: open the connect form right away
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusNonce]);

  const runTest = async () => {
    setTest(null);
    const r = await testAct.run(() => ops.gatewayUpstreamTest(upId, kind));
    if (r) {
      setTest({ t: r.result, note: r.result.ok ? (r.connectorError ? `Teste OK, mas o status na nuvem não foi atualizado: ${r.connectorError}` : "Status atualizado na sua conta: conectado (somente leitura).") : null });
      await onChanged();
    }
  };

  return (
    <IntegrationCard
      icon={<KeyRound size={18} />}
      title={title}
      connector={connector}
      anchor={kind}
      aside={
        <>
          <Caps c={connector} />
          <Limitations c={connector} />
        </>
      }
    >
      <div className={cx("cred", `cred-${cred.tone}`)}>
        <KeyRound size={14} aria-hidden />
        <span>{upLoading ? "Verificando gateway…" : cred.text}</span>
        {hasKey && <span className="mask" aria-label="chave oculta">••••••••••••</span>}
        {connector?.credentialRef && (
          <code title="Referência guardada na sua conta — nunca o segredo">{connector.credentialRef}</code>
        )}
      </div>
      {upError && gateway.healthy && <p className="field-err">Gateway: {upError}</p>}

      {mode === "form" && (
        <KeyForm
          id={upId}
          label={`Chave da ${title}`}
          onCancel={() => setMode("idle")}
          onSaved={async () => {
            setMode("idle");
            await reload();
            await onChanged();
            await runTest();
          }}
        />
      )}

      {mode === "confirm" && (
        <div className="confirm" role="alertdialog" aria-label={`Desconectar ${title}`}>
          <p>Remover a chave do Keychain, apagar da memória do gateway e marcar {title} como não conectada na sua conta?</p>
          <div className="row">
            <Btn
              kind="danger"
              busy={delAct.busy}
              icon={<Unplug size={14} aria-hidden />}
              onClick={async () => {
                const r = await delAct.run(() => ops.providerKeyDelete(upId, kind), (v) => (v.messages.length ? `Chave removida do Keychain. ${v.messages.join(" ")}` : "Chave removida do Keychain, do gateway e da conta."));
                if (r) {
                  setMode("idle");
                  setTest(null);
                  await reload();
                  await onChanged();
                }
              }}
            >
              Desconectar
            </Btn>
            <Btn kind="ghost" onClick={() => setMode("idle")} disabled={delAct.busy}>
              Cancelar
            </Btn>
          </div>
        </div>
      )}

      {mode === "idle" && (
        <div className="row">
          {!hasKey ? (
            <Btn kind="primary" icon={<Plug size={14} aria-hidden />} onClick={() => setMode("form")}>
              Conectar
            </Btn>
          ) : (
            <>
              <Btn kind="primary" busy={testAct.busy} icon={<FlaskConical size={14} aria-hidden />} onClick={() => void runTest()} disabled={!gateway.healthy}>
                Testar conexão
              </Btn>
              <Btn kind="ghost" onClick={() => setMode("form")}>
                Trocar chave
              </Btn>
              {stored && upstream && upstream.credentialSource !== "memory" && gateway.healthy && (
                <Btn kind="ghost" busy={syncAct.busy} icon={<RefreshCw size={14} aria-hidden />} onClick={() => void syncAct.run(async () => { const r = await ops.gatewayResync(); await onChanged(); return r; }, (r) => (r.errors.length ? null : "Chaves reenviadas ao gateway."))}>
                  Reenviar ao gateway
                </Btn>
              )}
              {stored && (
                <Btn kind="ghost" className="btn-quiet-danger" icon={<Unplug size={14} aria-hidden />} onClick={() => setMode("confirm")}>
                  Desconectar
                </Btn>
              )}
            </>
          )}
        </div>
      )}
      <ActionMsg s={testAct.error ? testAct : delAct.ok || delAct.error ? delAct : syncAct} />
      {test && <TestResult t={test.t} extra={test.note && <p className="test-note">{test.note}</p>} />}
    </IntegrationCard>
  );
}

/* ------------------------------ OpenAI-compatible ------------------------------ */

function CompatCard({ upstream, connector, onChanged, anchor, focusNonce = 0 }: { upstream: GatewayUpstream | null; connector: ConnectorDto | undefined; onChanged: () => Promise<void>; anchor?: boolean; focusNonce?: number }) {
  const { boot, gateway, reload } = useApp();
  const ops = useOps();
  const id = upstream?.id ?? "ollama";
  const current = upstream?.baseUrl ?? boot.settings.upstreamBaseUrls[id] ?? "http://127.0.0.1:11434";
  const [url, setUrl] = useState(current);
  useEffect(() => setUrl(current), [current]);
  const [keyOpen, setKeyOpen] = useState(false);
  const [test, setTest] = useState<UpstreamTest | null>(null);
  const urlAct = useAction();
  const testAct = useAction();
  const delAct = useAction();
  const stored = boot.settings.providerKeys.includes(id);
  const uid = useId();
  useEffect(() => {
    if (focusNonce) window.setTimeout(() => document.getElementById(uid)?.focus({ preventScroll: true }), 400);
  }, [focusNonce, uid]);

  return (
    <IntegrationCard
      anchor={anchor ? "openai_compatible" : undefined}
      icon={<Bot size={18} />}
      title={upstream ? `OpenAI-compatível · ${upstream.id}` : "OpenAI-compatível (Ollama, vLLM…)"}
      connector={connector}
      aside={
        <>
          <Caps c={connector} />
          <Limitations c={connector} />
        </>
      }
    >
      <form
        className="field"
        onSubmit={(e) => {
          e.preventDefault();
          void urlAct.run(async () => {
            await ops.gatewayUpstreamSetUrl(id, url);
            await reload();
            await onChanged();
          }, "URL salva e aplicada no gateway.");
        }}
      >
        <label htmlFor={uid}>URL base do servidor</label>
        <div className="field-row">
          <input id={uid} value={url} onChange={(e) => setUrl(e.target.value)} spellCheck={false} placeholder="http://127.0.0.1:11434" disabled={!gateway.healthy} />
          <Btn type="submit" busy={urlAct.busy} disabled={!gateway.healthy || url.trim() === current}>
            Salvar URL
          </Btn>
        </div>
        <span className="field-hint">Padrão do Ollama: http://127.0.0.1:11434. Servidores fora desta máquina (vLLM, OpenRouter…) precisam de https://.</span>
        <ActionMsg s={urlAct} />
      </form>

      <div className={cx("cred", stored || upstream?.hasCredential ? "cred-ok" : "cred-idle")}>
        <KeyRound size={14} aria-hidden />
        <span>{stored ? (upstream?.credentialSource === "memory" ? "Chave opcional no Keychain · ativa no gateway" : "Chave opcional no Keychain") : upstream?.hasCredential ? "Chave definida fora deste app" : "Sem chave (normal para servidores locais)"}</span>
      </div>
      {keyOpen && (
        <KeyForm
          id={id}
          optional
          label="Chave do servidor (opcional)"
          onCancel={() => setKeyOpen(false)}
          onSaved={async () => {
            setKeyOpen(false);
            await reload();
            await onChanged();
          }}
        />
      )}
      {!keyOpen && (
        <div className="row">
          <Btn
            kind="primary"
            busy={testAct.busy}
            icon={<FlaskConical size={14} aria-hidden />}
            disabled={!gateway.healthy || !upstream}
            onClick={async () => {
              setTest(null);
              const r = await testAct.run(() => ops.gatewayUpstreamTest(id, "openai_compatible"));
              if (r) {
                setTest(r.result);
                await onChanged();
              }
            }}
          >
            Testar conexão
          </Btn>
          <Btn kind="ghost" onClick={() => setKeyOpen(true)} disabled={!gateway.healthy}>
            {stored ? "Trocar chave" : "Adicionar chave"}
          </Btn>
          {stored && (
            <Btn kind="ghost" className="btn-quiet-danger" busy={delAct.busy} onClick={async () => {
              await delAct.run(async () => { const r = await ops.providerKeyDelete(id, null); await reload(); await onChanged(); return r; }, "Chave removida do Keychain e do gateway.");
            }}>
              Remover chave
            </Btn>
          )}
        </div>
      )}
      {!upstream && gateway.healthy && <p className="muted">O gateway não tem um upstream compatível configurado.</p>}
      <ActionMsg s={testAct.error ? testAct : delAct} />
      {test && <TestResult t={test} />}
    </IntegrationCard>
  );
}

/* ------------------------------ SDK / local agents ------------------------------ */

const safeKey = (s: string, d: string) => (s.trim().replace(/[^A-Za-z0-9._:-]/g, "-").slice(0, 120) || d);

function SdkCard({ connector, gatewayUrl, hasUpstream, onChanged }: { connector: ConnectorDto | undefined; gatewayUrl: string; hasUpstream: boolean; onChanged: () => Promise<void> }) {
  const { gateway } = useApp();
  const ops = useOps();
  const [lang, setLang] = useState<"python" | "ts" | "curl">("python");
  const [project, setProject] = useState("meu-projeto");
  const [agent, setAgent] = useState("meu-agente");
  const act = useAction();
  const [probe, setProbe] = useState<ProbeView | null>(null);
  const p = safeKey(project, "meu-projeto");
  const a = safeKey(agent, "meu-agente");
  const base = `${gatewayUrl}/v1`;
  const snippets = useMemo(
    () => ({
      python: `from openai import OpenAI\n\nclient = OpenAI(\n    base_url="${base}",\n    # sua chave passa em trânsito pelo gateway (não é gravada)\n    default_headers={"x-maindy-project": "${p}", "x-maindy-agent": "${a}"},\n)\nresp = client.chat.completions.create(\n    model="gpt-4.1-mini",\n    messages=[{"role": "user", "content": "Olá"}],\n)`,
      ts: `import OpenAI from "openai";\n\nconst client = new OpenAI({\n  baseURL: "${base}",\n  // sua chave passa em trânsito pelo gateway (não é gravada)\n  defaultHeaders: { "x-maindy-project": "${p}", "x-maindy-agent": "${a}" },\n});\nconst resp = await client.chat.completions.create({\n  model: "gpt-4.1-mini",\n  messages: [{ role: "user", content: "Olá" }],\n});`,
      curl: `# sem Authorization: o gateway usa a chave salva em Integrações\ncurl ${base}/chat/completions \\\n  -H "content-type: application/json" \\\n  -H "x-maindy-project: ${p}" \\\n  -H "x-maindy-agent: ${a}" \\\n  -d '{"model":"gpt-4.1-mini","messages":[{"role":"user","content":"Olá"}]}'`,
    }),
    [base, p, a],
  );
  const ev = probe?.event;

  return (
    <IntegrationCard
      anchor="local_agent_sdk"
      icon={<Code2 size={18} />}
      title="Agentes locais (SDK)"
      connector={connector}
      aside={
        <>
          <Caps c={connector} />
          <dl className="kv kv-tight">
            <dt>Base URL</dt>
            <dd>
              <code>{base}</code>
            </dd>
            <dt>Anthropic</dt>
            <dd>
              <code>{gatewayUrl}</code> em <code>/v1/messages</code>
            </dd>
          </dl>
          <Limitations c={connector} />
        </>
      }
    >
      <div className="sdk-attr">
        <label>
          <span>x-maindy-project</span>
          <input value={project} onChange={(e) => setProject(e.target.value)} spellCheck={false} />
        </label>
        <label>
          <span>x-maindy-agent</span>
          <input value={agent} onChange={(e) => setAgent(e.target.value)} spellCheck={false} />
        </label>
      </div>
      <div className="tabs" role="tablist" aria-label="Linguagem do exemplo">
        {(
          [
            ["python", "Python"],
            ["ts", "TypeScript"],
            ["curl", "curl"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={lang === k} className={cx(lang === k && "on")} onClick={() => setLang(k)}>
            {l}
          </button>
        ))}
      </div>
      <CodeBlock code={snippets[lang]} />
      <div className="row">
        <Btn
          kind="primary"
          busy={act.busy}
          icon={<Send size={14} aria-hidden />}
          disabled={!gateway.healthy || !hasUpstream}
          onClick={async () => {
            setProbe(null);
            const r = await act.run(() => ops.gatewayProbe(p, a));
            if (r) {
              setProbe(r);
              await onChanged();
            }
          }}
        >
          Enviar requisição de teste
        </Btn>
        <span className="muted">1 token de saída, pelo gateway, para o primeiro provedor configurado. Sem cache.</span>
      </div>
      {!hasUpstream && gateway.healthy && <p className="muted">Conecte uma chave ou um servidor compatível acima para enviar o teste.</p>}
      <ActionMsg s={act} />
      {probe && (
        <div className={cx("test-res", probe.error ? "test-bad" : "test-ok")} role="status">
          <div className="test-top">
            <strong>{probe.error ? `Falhou (HTTP ${probe.httpStatus})` : "Requisição medida pelo gateway"}</strong>
            <span>
              <code>{probe.upstreamId}</code> · <code>{probe.model}</code>
            </span>
            <span>
              {probe.latencyMs.toLocaleString("pt-BR")} ms <SourceBadge source={timedLocally(probe.latencyMs)} compact />
            </span>
          </div>
          {probe.error && <p className="field-err">{probe.error}</p>}
          {ev ? (
            <dl className="kv kv-4 probe-kv">
              <dt>Tokens (entrada/saída)</dt>
              <dd>
                {tokens(ev.usage.inputTokens)} / {tokens(ev.usage.outputTokens)} <SourceBadge source={ev.usage.source} compact />
              </dd>
              <dt>Custo</dt>
              <dd>
                {money(ev.cost)} <SourceBadge source={ev.cost.source} compact />
              </dd>
              <dt>Atribuição</dt>
              <dd>
                {ev.projectKey ?? "—"} / {ev.agentKey ?? "—"}
              </dd>
              <dt>Evento</dt>
              <dd>
                <code>{ev.eventId.slice(0, 8)}</code> · {ago(ev.occurredAt)}
              </dd>
            </dl>
          ) : (
            !probe.error && <p className="muted">Resposta recebida; o evento medido ainda não apareceu em /maindy/events.</p>
          )}
        </div>
      )}
    </IntegrationCard>
  );
}

/* ------------------------------ Claude Code / Codex ------------------------------ */

function PreviewBlock({ preview }: { preview: unknown }) {
  const text =
    typeof preview === "string"
      ? preview
      : Array.isArray(preview)
        ? preview.map((x) => (typeof x === "string" ? x : JSON.stringify(x, null, 2))).join("\n")
        : preview && typeof preview === "object" && typeof (preview as { diff?: unknown }).diff === "string"
          ? (preview as { diff: string }).diff
          : JSON.stringify(preview, null, 2);
  return (
    <pre className="diff" tabIndex={0} aria-label="Prévia das mudanças">
      {text.split("\n").map((l, i) => (
        <span key={i} className={cx("dl", l.startsWith("+") && !l.startsWith("+++") && "d-add", l.startsWith("-") && !l.startsWith("---") && "d-del", (l.startsWith("@@") || l.startsWith("---") || l.startsWith("+++")) && "d-meta")}>
          {l || " "}
        </span>
      ))}
    </pre>
  );
}

const WATCH_EVERY_MS = 3000;
const WATCH_FOR_MS = 15 * 60_000;
const TARGET_LABEL: Record<AgentTarget, string> = { vscode: "Abrir no VS Code", terminal: "Abrir no Terminal", claude_app: "Abrir no app Claude" };

/**
 * "Configurar com o Claude Code / Codex": the prompt (generated by the Rust core: paths only, no secrets)
 * opens pre-filled in the user's own agent — never auto-sent. While the agent works, the checklist above
 * is refreshed from GET /maindy/integrations every 3 s and updates live.
 */
function AgentSetupPanel({ tool, installed, onStartWatching }: { tool: IntegrationTool; installed: boolean; onStartWatching: () => void }) {
  const ops = useOps();
  const isCC = tool === "claude-code";
  const setup = useResource<AgentSetup>(() => ops.agentSetup(tool), [ops, tool]);
  const open = useAction();
  const [copied, setCopied] = useState<"prompt" | null>(null);
  const s = setup.data;
  const t = s?.targets ?? { vscode: false, terminal: false, claudeApp: false };
  const anyTarget = isCC && (t.vscode || t.terminal || t.claudeApp);
  const name = isCC ? "Claude Code" : "Codex";

  const launch = async (target: AgentTarget) => {
    const r = await open.run(async () => (await ops.agentOpen(tool, target), true), target === "terminal" ? "Abrimos uma nova janela do Terminal com o prompt preenchido. Revise e pressione Enter." : "Prompt aberto e preenchido. Revise e pressione Enter para o Claude Code começar.");
    if (r) onStartWatching();
  };
  const copy = async () => {
    if (!s?.prompt) return;
    const ok = await copyText(s.prompt);
    if (ok) {
      setCopied("prompt");
      window.setTimeout(() => setCopied(null), 2200);
      onStartWatching();
    } else open.set({ busy: false, ok: null, error: "Não foi possível copiar. Selecione o prompt abaixo e copie manualmente." });
  };

  return (
    <div className="agent-box" role="region" aria-label={`Configurar com o ${name}`}>
      <div className="agent-h">
        <Sparkles size={15} aria-hidden />
        <strong>Configurar com o {name}</strong>
        {!installed && <span className="chip chip-sm agent-rec">recomendado</span>}
      </div>
      <p className="agent-lead">
        O {name} roda o CLI da maindy. por você: mostra a prévia das mudanças, instala <b>só depois do seu “sim”</b> e confere o resultado.
      </p>
      <p className="agent-consent">
        <ShieldCheck size={14} aria-hidden />
        <span>
          O prompt abre <b>preenchido, não enviado</b>: você revisa e pressiona Enter. Ele não contém chaves nem tokens, só o caminho do gateway local.
        </span>
      </p>
      {setup.error ? (
        <p className="field-err">Não foi possível gerar o prompt: {setup.error}</p>
      ) : !s ? (
        <p className="muted">Preparando o prompt…</p>
      ) : !s.prompt ? (
        <p className="muted">Gateway local não instalado nesta versão do app — o prompt precisa do caminho dele.</p>
      ) : (
        <>
          <div className="row agent-actions">
            {isCC && t.vscode && (
              <Btn kind="primary" busy={open.busy} icon={<Code2 size={14} aria-hidden />} onClick={() => void launch("vscode")}>
                {TARGET_LABEL.vscode}
              </Btn>
            )}
            {isCC && t.terminal && (
              <Btn kind={t.vscode ? "default" : "primary"} busy={open.busy} icon={<Terminal size={14} aria-hidden />} onClick={() => void launch("terminal")}>
                {TARGET_LABEL.terminal}
              </Btn>
            )}
            {isCC && t.claudeApp && (
              <Btn kind={t.vscode || t.terminal ? "default" : "primary"} busy={open.busy} icon={<AppWindow size={14} aria-hidden />} onClick={() => void launch("claude_app")}>
                {TARGET_LABEL.claude_app}
              </Btn>
            )}
            <Btn kind={anyTarget ? "ghost" : "primary"} icon={copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />} onClick={() => void copy()}>
              {copied ? "Prompt copiado" : "Copiar prompt"}
            </Btn>
          </div>
          <p className="field-hint">
            {isCC
              ? "Cursor, JetBrains ou outro editor: use “Copiar prompt” e cole no chat do Claude Code."
              : "Cole no Codex CLI (ou no seu agente de código), revise e envie."}
          </p>
          <ActionMsg s={open} />
          {isCC && !t.terminal && s.shellCommand && (
            <details className="agent-d">
              <summary>Prefere o Terminal? Cole este comando</summary>
              <CodeBlock code={s.shellCommand} label="Terminal" />
              <p className="field-hint">O botão “Abrir no Terminal” aparece depois que você usa o Claude Code interativo uma vez (é quando ele registra o atalho claude-cli://).</p>
            </details>
          )}
          <details className="agent-d">
            <summary>Ver o prompt ({s.promptChars.toLocaleString("pt-BR")} caracteres)</summary>
            <CodeBlock code={s.prompt} label="Prompt" />
          </details>
        </>
      )}
    </div>
  );
}

function WatchLine({ watching, done, timedOut, title, onStop }: { watching: boolean; done: boolean; timedOut: boolean; title: string; onStop: () => void }) {
  if (done)
    return (
      <div className="watch-line watch-done" role="status">
        <Check size={14} aria-hidden />
        <span>
          Instalação confirmada pelo gateway. <b>Reinicie o {title}</b> para a telemetria valer{title === "Claude Code" ? "; os limites da assinatura aparecem pela status line" : ""}.
        </span>
      </div>
    );
  if (timedOut)
    return (
      <div className="watch-line" role="status">
        <span>Ainda não detectamos a instalação. Confira o chat do agente ou use a instalação direta abaixo.</span>
      </div>
    );
  if (!watching) return null;
  return (
    <div className="watch-line" role="status" aria-live="polite">
      <Loader2 size={14} className="spin" aria-hidden />
      <span>Aguardando o {title} concluir… a lista acima se atualiza sozinha (a cada 3 s).</span>
      <button type="button" className="link" onClick={onStop}>
        parar
      </button>
    </div>
  );
}

function ToolCard({ tool, connector, res, onChanged, focusNonce = 0 }: { tool: IntegrationTool; connector: ConnectorDto | undefined; res: Resource<ToolIntegrations>; onChanged: () => Promise<void>; focusNonce?: number }) {
  const { gateway } = useApp();
  const ops = useOps();
  const isCC = tool === "claude-code";
  const info = res.data ? (isCC ? res.data.claudeCode : res.data.codex) : null;
  const [pending, setPending] = useState<{ action: "install" | "uninstall"; force: boolean; r: IntegrationApplyResult } | null>(null);
  const [done, setDone] = useState<IntegrationApplyResult | null>(null);
  const preview = useAction();
  const apply = useAction();
  const title = isCC ? "Claude Code" : "Codex CLI";
  const path = info ? (isCC ? (info as ToolIntegrations["claudeCode"]).settingsPath : (info as ToolIntegrations["codex"]).configPath) : null;
  const installed = !!info?.installed;
  // agent panel: open by default until installed; a deep link (focusNonce) always opens it
  const [agentOpen, setAgentOpen] = useState<boolean | null>(null);
  const showAgent = agentOpen ?? !installed;
  const [watchUntil, setWatchUntil] = useState<number | null>(null);
  const [watchDone, setWatchDone] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const reloadRef = useRef(res.reload);
  reloadRef.current = res.reload;

  useEffect(() => {
    if (focusNonce) setAgentOpen(true);
  }, [focusNonce]);

  // live checklist while the user's agent installs
  useEffect(() => {
    if (watchUntil === null) return;
    const t = window.setInterval(() => {
      if (Date.now() > watchUntil) {
        setWatchUntil(null);
        setTimedOut(true);
        return;
      }
      void reloadRef.current();
    }, WATCH_EVERY_MS);
    return () => window.clearInterval(t);
  }, [watchUntil]);
  useEffect(() => {
    if (watchUntil !== null && installed) {
      setWatchUntil(null);
      setWatchDone(true);
      void onChanged();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installed, watchUntil]);

  const startWatching = () => {
    setWatchDone(false);
    setTimedOut(false);
    if (!installed) setWatchUntil(Date.now() + WATCH_FOR_MS);
  };

  const startPreview = async (action: "install" | "uninstall", force = false) => {
    setDone(null);
    apply.reset();
    const r = await preview.run(() => ops.integrationApply(tool, action, true, force || undefined));
    if (r) setPending({ action, force, r });
  };

  return (
    <IntegrationCard
      anchor={isCC ? "claude_code" : "codex"}
      icon={<Terminal size={18} />}
      title={title}
      connector={connector}
      aside={
        <>
          <Caps c={connector} />
          {isCC ? (
            <p className="note-box">
              <b>Limites da assinatura</b> (janelas de 5 h e 7 dias) só chegam pela <b>status line</b>, e somente enquanto o Claude Code está aberto, em planos Pro/Max. Não existe API pública de limites e a maindy não usa endpoints internos.
            </p>
          ) : (
            <p className="note-box">
              O Codex com <b>login da conta ChatGPT</b> fica em observação (OTel). Roteamento e cache pelo gateway só funcionam com <b>chave de API</b> (<code>wire_api = "responses"</code>).
            </p>
          )}
          <Limitations c={connector} />
        </>
      }
    >
      {res.error ? (
        <p className="muted">{gateway.healthy ? `Detecção indisponível: ${res.error}` : "Ative o gateway local para detectar e instalar."}</p>
      ) : !info ? (
        <p className="muted">{res.loading ? "Detectando…" : "Detecção indisponível."}</p>
      ) : (
        <>
          <ul className="checks" aria-live={watchUntil !== null ? "polite" : undefined}>
            <Check2 ok={info.detected}>{isCC ? "Claude Code encontrado nesta máquina" : "Codex CLI encontrado nesta máquina"}</Check2>
            <Check2 ok={info.installed} hint={path ? <code>{path}</code> : undefined}>
              Integração maindy. instalada
            </Check2>
            <Check2 ok={info.otel}>OpenTelemetry → gateway (uso e custo)</Check2>
            {isCC && <Check2 ok={(info as ToolIntegrations["claudeCode"]).statusLine}>Status line (limites da assinatura)</Check2>}
            {isCC && <Check2 ok={(info as ToolIntegrations["claudeCode"]).hook}>Hook PostToolUse (compressão de saídas do Bash)</Check2>}
            <Check2 ok={info.lastEventAt ? true : null} hint={info.lastEventAt ? ago(info.lastEventAt) : "nenhum ainda"}>
              Último evento recebido
            </Check2>
          </ul>
          <WatchLine watching={watchUntil !== null} done={watchDone} timedOut={timedOut} title={title} onStop={() => setWatchUntil(null)} />

          {showAgent && !pending && <AgentSetupPanel tool={tool} installed={installed} onStartWatching={startWatching} />}

          {pending ? (
            <div className="preview-box" role="region" aria-label="Prévia da instalação">
              <div className="preview-h">
                <strong>{pending.action === "install" ? "Prévia da instalação" : "Prévia da remoção"}</strong>
                <span className="muted">nada foi gravado ainda</span>
              </div>
              {pending.r.preview !== undefined && pending.r.preview !== null && <PreviewBlock preview={pending.r.preview} />}
              <dl className="kv kv-tight">
                <dt>Mudanças</dt>
                <dd>{pending.r.changed.length ? pending.r.changed.map((c) => <code key={c}>{c}</code>) : "nenhuma mudança necessária"}</dd>
                <dt>Backup</dt>
                <dd>{pending.r.backupPath ? <code>{pending.r.backupPath}</code> : pending.r.changed.length ? "cópia com data e hora criada automaticamente ao confirmar" : "não será necessário"}</dd>
              </dl>
              <div className="row">
                <Btn
                  kind={pending.action === "install" ? "primary" : "danger"}
                  busy={apply.busy}
                  autoFocus
                  disabled={pending.r.changed.length === 0}
                  onClick={async () => {
                    const r = await apply.run(() => ops.integrationApply(tool, pending.action, false, pending.force || undefined), pending.action === "install" ? `${title}: integração instalada. Reinicie o ${title} para valer.` : `${title}: integração removida.`);
                    if (r) {
                      setDone(r);
                      setPending(null);
                      setWatchUntil(null);
                      await onChanged();
                    }
                  }}
                >
                  {pending.action === "install" ? "Confirmar instalação" : "Confirmar remoção"}
                </Btn>
                <Btn kind="ghost" onClick={() => setPending(null)} disabled={apply.busy}>
                  Cancelar
                </Btn>
              </div>
            </div>
          ) : (
            <div className="row direct-row">
              {!installed ? (
                <>
                  {showAgent && <span className="muted direct-or">Ou instale direto daqui, com prévia das mudanças:</span>}
                  <Btn kind={showAgent ? "default" : "primary"} busy={preview.busy} disabled={!gateway.healthy || !info.detected} onClick={() => void startPreview("install")}>
                    Instalar integração…
                  </Btn>
                </>
              ) : (
                <>
                  <Btn busy={preview.busy} disabled={!gateway.healthy} onClick={() => void startPreview("install")}>
                    Reparar / atualizar…
                  </Btn>
                  <Btn kind="ghost" className="btn-quiet-danger" busy={preview.busy} disabled={!gateway.healthy} onClick={() => void startPreview("uninstall")}>
                    Desinstalar…
                  </Btn>
                  {!showAgent && (
                    <Btn kind="ghost" icon={<Sparkles size={14} aria-hidden />} onClick={() => setAgentOpen(true)}>
                      {isCC ? "Configurar com o Claude Code" : "Configurar com o Codex"}
                    </Btn>
                  )}
                </>
              )}
              {isCC && installed && !(info as ToolIntegrations["claudeCode"]).statusLine && (
                <Btn kind="ghost" busy={preview.busy} disabled={!gateway.healthy} onClick={() => void startPreview("install", true)}>
                  Usar a status line da maindy…
                </Btn>
              )}
              {!info.detected && <span className="muted">Instale o {title} primeiro.</span>}
            </div>
          )}
          <ActionMsg s={preview.error ? preview : apply} />
          {isCC && installed && !(info as ToolIntegrations["claudeCode"]).statusLine && !pending && (
            <p className="muted">Sua status line atual foi preservada. Sem a status line da maindy, os limites da assinatura não chegam aqui.</p>
          )}
          {done?.backupPath && (
            <p className="muted">
              Backup da configuração anterior: <code>{done.backupPath}</code>
            </p>
          )}
        </>
      )}
    </IntegrationCard>
  );
}

/* ------------------------------ chat apps ------------------------------ */

function ChatAppsCard({ connector }: { connector: ConnectorDto | undefined }) {
  return (
    <section id="conn-chat_apps" className="card icard icard-na" aria-label="Apps de chat">
      <header className="icard-h">
        <span className="icard-ico" aria-hidden>
          <MessageSquareOff size={18} />
        </span>
        <div className="icard-title">
          <h3>Apps de chat (Claude, ChatGPT)</h3>
          <p>{connector?.description ?? "Os aplicativos de chat não oferecem API oficial para otimização por terceiros."}</p>
        </div>
        <span className="chip chip-sm chip-na">Não suportado</span>
      </header>
      <ul className="bullets na-list">
        {(connector?.limitations.length ? connector.limitations : ["Não há API oficial de uso, cota ou interceptação para os apps de chat.", "A maindy nunca captura conversas, cookies nem tokens de outros aplicativos."]).map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </section>
  );
}
