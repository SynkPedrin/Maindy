import { Bot, FolderKanban, Pencil, Plus, Trash2 } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { asList, periodRange, useAction, useApiGet, useApp, useOps, useResource, type Dash } from "../../data";
import { weakestSource } from "../../sources";
import type { AgentDto, Entity, MeasurementSource, Period, ProjectDto, RequestUsageEvent } from "../../types";
import { ActionMsg, Btn, Card, CodeBlock, Empty, ErrorLine, SourceBadge, cx, money, tokens } from "../../ui";

type Usage = { requests: number; tokens: number; costMicros: number; currency: string; sources: MeasurementSource[]; tokenSources: MeasurementSource[] };

const MAX_PAGES = 5;
const PAGE = 200;

/** Runs of the period (newest first), paginated up to MAX_PAGES × PAGE. */
async function loadRuns(get: <T>(p: string, q?: Record<string, string>) => Promise<T>, from: string) {
  const out: RequestUsageEvent[] = [];
  let cursor: string | null = null;
  let truncated = false;
  for (let i = 0; i < MAX_PAGES; i++) {
    const page: unknown = await get<unknown>("/v1/runs", { limit: String(PAGE), ...(cursor ? { cursor } : {}) });
    const items = asList<RequestUsageEvent>(page) ?? [];
    let older = false;
    for (const r of items) {
      if (r.occurredAt < from) older = true;
      else out.push(r);
    }
    cursor = (page as { nextCursor?: string | null })?.nextCursor ?? null;
    if (older || !cursor) return { runs: out, truncated: false };
    truncated = i === MAX_PAGES - 1;
  }
  return { runs: out, truncated };
}

function aggregate(runs: RequestUsageEvent[], by: "projectKey" | "agentKey") {
  const m = new Map<string, Usage>();
  for (const r of runs) {
    const k = r[by];
    if (!k) continue;
    const u = m.get(k) ?? { requests: 0, tokens: 0, costMicros: 0, currency: r.cost.currency, sources: [], tokenSources: [] };
    u.requests += 1;
    u.tokens += r.usage.inputTokens + r.usage.outputTokens;
    if (r.cost.currency === u.currency) u.costMicros += r.cost.micros;
    u.sources.push(r.cost.source);
    u.tokenSources.push(r.usage.source);
    m.set(k, u);
  }
  return m;
}

const periodText: Record<Period, string> = { "24h": "24 h", "7d": "7 dias", "30d": "30 dias" };

export function Projects({ period }: { d: Dash; period: Period }) {
  const { demo } = useApp();
  const get = useApiGet();
  const projects = useResource(() => get<ProjectDto[]>("/v1/projects"), [get]);
  const agents = useResource(() => get<AgentDto[]>("/v1/agents"), [get]);
  const usage = useResource(() => loadRuns(get, periodRange(period).from), [get, period], 60_000);
  const runs = usage.data?.runs ?? [];
  const byProject = aggregate(runs, "projectKey");
  const byAgent = aggregate(runs, "agentKey");
  const reloadAll = async () => {
    await Promise.all([projects.reload(), agents.reload()]);
  };
  const plist = asList<ProjectDto>(projects.data) ?? [];
  const alist = asList<AgentDto>(agents.data) ?? [];
  const unregistered = [...byProject.keys()].filter((k) => !plist.some((p) => p.key === k));

  return (
    <div className="stack">
      <p className="footnote">
        Uso agregado de {usage.loading && !usage.data ? "…" : runs.length.toLocaleString("pt-BR")} operações dos últimos {periodText[period]}
        {usage.data?.truncated ? ` (limitado às ${(MAX_PAGES * PAGE).toLocaleString("pt-BR")} mais recentes)` : ""}. A chave de cada item é o valor do header enviado ao gateway.
        {demo ? " Alterações em demonstração ficam só nesta janela." : ""}
      </p>
      {usage.error && <ErrorLine message={`Uso indisponível: ${usage.error}`} />}
      <EntityCard entity="projects" title="Projetos" rows={plist} res={projects} usage={byProject} projects={plist} onChanged={reloadAll} unregistered={unregistered} />
      <EntityCard entity="agents" title="Agentes" rows={alist} res={agents} usage={byAgent} projects={plist} onChanged={reloadAll} unregistered={[...byAgent.keys()].filter((k) => !alist.some((a) => a.key === k))} />
    </div>
  );
}

function UsageCells({ u }: { u: Usage | undefined }) {
  if (!u)
    return (
      <>
        <td className="num muted">0</td>
        <td className="num muted">—</td>
        <td className="num muted">—</td>
      </>
    );
  const src = weakestSource(u.sources);
  return (
    <>
      <td className="num">{u.requests.toLocaleString("pt-BR")}</td>
      <td className="num">
        {tokens(u.tokens)} <SourceBadge source={weakestSource(u.tokenSources)} compact />
      </td>
      <td className="num">
        {money({ micros: u.costMicros, currency: u.currency, source: src })} <SourceBadge source={src} compact />
      </td>
    </>
  );
}

function EntityCard({
  entity,
  title,
  rows,
  res,
  usage,
  projects,
  onChanged,
  unregistered,
}: {
  entity: Entity;
  title: string;
  rows: Array<ProjectDto | AgentDto>;
  res: { error: string | null; loading: boolean; data: unknown };
  usage: Map<string, Usage>;
  projects: ProjectDto[];
  onChanged: () => Promise<void>;
  unregistered: string[];
}) {
  const [creating, setCreating] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const isProject = entity === "projects";
  const header = isProject ? "x-maindy-project" : "x-maindy-agent";
  return (
    <Card
      title={
        <span className="title-ico">
          {isProject ? <FolderKanban size={15} aria-hidden /> : <Bot size={15} aria-hidden />} {title}
        </span>
      }
      aside={
        creating === null && (
          <Btn size="sm" kind="primary" icon={<Plus size={13} aria-hidden />} onClick={() => setCreating("")}>
            {isProject ? "Novo projeto" : "Novo agente"}
          </Btn>
        )
      }
    >
      {creating !== null && <CreateForm entity={entity} initialKey={creating} projects={projects} onDone={async (ok) => (setCreating(null), ok && (await onChanged()))} />}
      {res.error ? (
        <ErrorLine message={`${title} indisponíveis: ${res.error}`} />
      ) : rows.length === 0 ? (
        <Empty icon={isProject ? <FolderKanban size={20} /> : <Bot size={20} />} title={res.loading ? "Carregando…" : isProject ? "Nenhum projeto cadastrado" : "Nenhum agente cadastrado"}>
          {!res.loading && `Cadastre a chave usada no header ${header} para dar nome e acompanhar o uso.`}
        </Empty>
      ) : (
        <div className="table-wrap">
          <table className="table entity-table">
            <thead>
              <tr>
                <th>{isProject ? "Projeto" : "Agente"}</th>
                {!isProject && <th>Projeto</th>}
                <th className="num">Requisições</th>
                <th className="num">Tokens</th>
                <th className="num">Custo</th>
                <th className="actions-col">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <EntityRow key={r.id} entity={entity} row={r} usage={usage.get(r.key)} projects={projects} open={open === r.id} onToggle={() => setOpen((o) => (o === r.id ? null : r.id))} onChanged={onChanged} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {unregistered.length > 0 && (
        <div className="unreg">
          <span className="muted">Chaves com uso e sem cadastro:</span>
          {unregistered.slice(0, 8).map((k) => (
            <button key={k} type="button" className="chip chip-sm chip-btn" onClick={() => setCreating(k)} title={`Cadastrar ${k}`}>
              <Plus size={11} aria-hidden /> {k}
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

function CreateForm({ entity, initialKey, projects, onDone }: { entity: Entity; initialKey: string; projects: ProjectDto[]; onDone: (ok: boolean) => void }) {
  const ops = useOps();
  const [key, setKey] = useState(initialKey);
  const [name, setName] = useState(initialKey);
  const [desc, setDesc] = useState("");
  const [projectId, setProjectId] = useState("");
  const act = useAction();
  const fid = useId();
  const keyOk = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(key.trim());
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const r = await act.run(() =>
      ops.entityCreate(entity, { key: key.trim(), name: name.trim(), description: desc.trim() || null, ...(entity === "agents" ? { projectId: projectId || null } : {}) }),
    );
    if (r) onDone(true);
  };
  return (
    <form className="create-form" onSubmit={(e) => void submit(e)} aria-label={entity === "projects" ? "Novo projeto" : "Novo agente"}>
      <div className="create-grid">
        <label htmlFor={`${fid}-k`}>
          Chave (header {entity === "projects" ? "x-maindy-project" : "x-maindy-agent"})
          <input id={`${fid}-k`} value={key} onChange={(e) => setKey(e.target.value)} spellCheck={false} placeholder="api-checkout" autoFocus aria-invalid={key.length > 0 && !keyOk} />
        </label>
        <label htmlFor={`${fid}-n`}>
          Nome
          <input id={`${fid}-n`} value={name} onChange={(e) => setName(e.target.value)} placeholder="API de checkout" />
        </label>
        {entity === "agents" && (
          <label htmlFor={`${fid}-p`}>
            Projeto
            <select id={`${fid}-p`} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">(nenhum)</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label htmlFor={`${fid}-d`} className="span-all">
          Descrição (opcional)
          <input id={`${fid}-d`} value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={500} />
        </label>
      </div>
      {key.length > 0 && !keyOk && <p className="field-err">Use letras, números, ponto, hífen, dois-pontos ou sublinhado (até 120).</p>}
      <div className="row">
        <Btn type="submit" kind="primary" busy={act.busy} disabled={!keyOk || !name.trim()}>
          Criar
        </Btn>
        <Btn kind="ghost" onClick={() => onDone(false)} disabled={act.busy}>
          Cancelar
        </Btn>
      </div>
      <ActionMsg s={act} />
    </form>
  );
}

function EntityRow({
  entity,
  row,
  usage,
  projects,
  open,
  onToggle,
  onChanged,
}: {
  entity: Entity;
  row: ProjectDto | AgentDto;
  usage: Usage | undefined;
  projects: ProjectDto[];
  open: boolean;
  onToggle: () => void;
  onChanged: () => Promise<void>;
}) {
  const ops = useOps();
  const { boot } = useApp();
  const [mode, setMode] = useState<"view" | "rename" | "delete">("view");
  const [name, setName] = useState(row.name);
  const act = useAction();
  const isProject = entity === "projects";
  const header = isProject ? "x-maindy-project" : "x-maindy-agent";
  const cols = isProject ? 5 : 6;
  const projectName = !isProject ? projects.find((p) => p.id === (row as AgentDto).projectId)?.name : undefined;
  return (
    <>
      <tr className={cx(open && "row-open")}>
        <td>
          {mode === "rename" ? (
            <form
              className="inline-edit"
              onSubmit={async (e) => {
                e.preventDefault();
                const r = await act.run(() => ops.entityUpdate(entity, row.id, { name: name.trim() }), "Nome atualizado.");
                if (r) {
                  setMode("view");
                  await onChanged();
                }
              }}
            >
              <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Novo nome" autoFocus onKeyDown={(e) => e.key === "Escape" && setMode("view")} />
              <Btn size="sm" type="submit" kind="primary" busy={act.busy} disabled={!name.trim() || name.trim() === row.name}>
                Salvar
              </Btn>
              <Btn size="sm" kind="ghost" onClick={() => setMode("view")}>
                Cancelar
              </Btn>
            </form>
          ) : (
            <button type="button" className="entity-name" onClick={onToggle} aria-expanded={open}>
              <strong>{row.name}</strong>
              <code>{row.key}</code>
              {row.description && <span className="muted">{row.description}</span>}
            </button>
          )}
        </td>
        {!isProject && <td className="muted">{projectName ?? "—"}</td>}
        <UsageCells u={usage} />
        <td className="actions-col">
          {mode === "view" && (
            <span className="row-actions">
              <button type="button" className="icon-btn" aria-label={`Renomear ${row.name}`} title="Renomear" onClick={() => (setName(row.name), setMode("rename"))}>
                <Pencil size={14} />
              </button>
              <button type="button" className="icon-btn icon-danger" aria-label={`Excluir ${row.name}`} title="Excluir" onClick={() => setMode("delete")}>
                <Trash2 size={14} />
              </button>
            </span>
          )}
        </td>
      </tr>
      {mode === "delete" && (
        <tr className="row-confirm">
          <td colSpan={cols}>
            <div className="confirm" role="alertdialog" aria-label={`Excluir ${row.name}`}>
              <p>
                Excluir <b>{row.name}</b>? O histórico de uso com <code>{row.key}</code> continua nos relatórios; só o cadastro é removido.
              </p>
              <div className="row">
                <Btn
                  kind="danger"
                  busy={act.busy}
                  autoFocus
                  onClick={async () => {
                    const r = await act.run(() => ops.entityDelete(entity, row.id));
                    if (r) {
                      setMode("view");
                      await onChanged();
                    }
                  }}
                >
                  Excluir
                </Btn>
                <Btn kind="ghost" onClick={() => setMode("view")} disabled={act.busy}>
                  Cancelar
                </Btn>
              </div>
            </div>
          </td>
        </tr>
      )}
      {(act.error || act.ok) && mode !== "delete" && (
        <tr className="row-msg">
          <td colSpan={cols}>
            <ActionMsg s={act} />
          </td>
        </tr>
      )}
      {act.error && mode === "delete" && (
        <tr className="row-msg">
          <td colSpan={cols}>
            <ActionMsg s={act} />
          </td>
        </tr>
      )}
      {open && (
        <tr className="row-detail">
          <td colSpan={cols}>
            <CodeBlock
              label={`Atribuir uso a ${row.name}`}
              code={`# header em qualquer requisição ao gateway (${boot.gatewayUrl})\n${header}: ${row.key}\n\n# Claude Code com chave de API (ANTHROPIC_BASE_URL=${boot.gatewayUrl})\nexport ANTHROPIC_CUSTOM_HEADERS="${header}: ${row.key}"`}
            />
          </td>
        </tr>
      )}
    </>
  );
}
