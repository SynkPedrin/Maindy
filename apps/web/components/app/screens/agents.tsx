"use client";
import { useState, type FormEvent } from "react";
import { Bot, FolderKanban, Plus, Trash2 } from "lucide-react";
import { useAgents, useCreateAgent, useCreateProject, useDeleteAgent, useDeleteProject, useMe, useProjects } from "@/lib/api/hooks";
import { errorMessage } from "@/lib/api/client";
import type { AgentDto, ProjectDto } from "@/lib/api/schemas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { CodeLine } from "@/components/ui/copy-button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { PageIntro } from "../page-intro";
import { formatDate } from "../format";

function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function CreateDialog({ kind, open, onOpenChange, projects }: { kind: "project" | "agent"; open: boolean; onOpenChange: (o: boolean) => void; projects: ProjectDto[] }) {
  const createP = useCreateProject();
  const createA = useCreateAgent();
  const toast = useToast();
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const busy = createP.isPending || createA.isPending;
  const effectiveKey = keyTouched ? key : slugify(name);

  function reset() {
    setName("");
    setKey("");
    setKeyTouched(false);
    setDescription("");
    setProjectId("");
    setError(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !effectiveKey) return setError("Informe nome e identificador.");
    setError(null);
    try {
      if (kind === "project") await createP.mutateAsync({ name: name.trim(), key: effectiveKey, description: description.trim() || null });
      else await createA.mutateAsync({ name: name.trim(), key: effectiveKey, description: description.trim() || null, projectId: projectId || null });
      toast({ tone: "success", title: kind === "project" ? "Projeto criado" : "Agente criado" });
      reset();
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
      title={kind === "project" ? "Novo projeto" : "Novo agente"}
      description="O identificador é enviado pelo seu código nos headers x-maindy-project / x-maindy-agent para atribuir custo e economia."
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Nome">{({ id }) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} autoFocus />}</Field>
        <Field label="Identificador" hint="Letras, números, ponto, hífen ou sublinhado." error={error}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              className="font-mono"
              value={effectiveKey}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              onChange={(e) => {
                setKeyTouched(true);
                setKey(e.target.value);
              }}
            />
          )}
        </Field>
        {kind === "agent" ? (
          <Field label="Projeto (opcional)">
            {({ id }) => (
              <Select id={id} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">Sem projeto</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
        <Field label="Descrição (opcional)">{({ id }) => <Textarea id={id} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />}</Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" loading={busy}>
            Criar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function ItemRow({ item, sub, onDelete, canWrite, deleting }: { item: ProjectDto | AgentDto; sub?: string; onDelete: () => void; canWrite: boolean; deleting: boolean }) {
  return (
    <li className="flex items-center gap-3 px-5 py-3.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium text-fg">{item.name}</p>
        <p className="truncate text-[12px] text-subtle">
          <code className="font-mono">{item.key ?? item.slug}</code>
          {sub ? ` · ${sub}` : ""}
          {item.createdAt ? ` · criado ${formatDate(item.createdAt)}` : ""}
        </p>
        {item.description ? <p className="mt-0.5 truncate text-[12.5px] text-muted">{item.description}</p> : null}
      </div>
      {canWrite ? (
        <Button size="sm" variant="ghost" onClick={onDelete} loading={deleting} aria-label={`Excluir ${item.name}`}>
          <Trash2 className="size-3.5" aria-hidden />
        </Button>
      ) : null}
    </li>
  );
}

export function AgentsScreen() {
  const me = useMe();
  const projects = useProjects();
  const agents = useAgents();
  const delP = useDeleteProject();
  const delA = useDeleteAgent();
  const toast = useToast();
  const [creating, setCreating] = useState<"project" | "agent" | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "project" | "agent"; id: string; name: string } | null>(null);
  const canWrite = me.data?.role !== "viewer";
  const projectName = (id?: string | null) => projects.data?.find((p) => p.id === id)?.name;

  function doDelete() {
    if (!confirm) return;
    const m = confirm.kind === "project" ? delP : delA;
    m.mutate(confirm.id, {
      onSuccess: () => {
        toast({ tone: "success", title: "Excluído" });
        setConfirm(null);
      },
      onError: (e) => toast({ tone: "error", title: "Não foi possível excluir", description: errorMessage(e) }),
    });
  }

  const list = (kind: "project" | "agent") => {
    const q = kind === "project" ? projects : agents;
    if (q.isPending)
      return (
        <div className="space-y-3 p-5">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      );
    if (q.isError)
      return (
        <div className="p-5">
          <ErrorState compact message={errorMessage(q.error)} onRetry={() => q.refetch()} />
        </div>
      );
    if (q.data.length === 0)
      return (
        <EmptyState
          icon={kind === "project" ? <FolderKanban /> : <Bot />}
          title={kind === "project" ? "Nenhum projeto" : "Nenhum agente"}
          description={kind === "project" ? "Projetos agrupam custo, economia e políticas por produto ou cliente." : "Identifique agentes para ver loops, custo e economia por agente."}
          className="py-10"
        >
          {canWrite ? (
            <Button size="sm" variant="secondary" onClick={() => setCreating(kind)}>
              <Plus className="size-3.5" aria-hidden /> Criar {kind === "project" ? "projeto" : "agente"}
            </Button>
          ) : null}
        </EmptyState>
      );
    return (
      <ul className="divide-y divide-line">
        {q.data.map((it) => (
          <ItemRow
            key={it.id}
            item={it}
            sub={kind === "agent" ? projectName((it as AgentDto).projectId) ?? "sem projeto" : undefined}
            canWrite={canWrite}
            deleting={false}
            onDelete={() => setConfirm({ kind, id: it.id, name: it.name })}
          />
        ))}
      </ul>
    );
  };

  return (
    <div>
      <PageIntro eyebrow="Agentes & Projetos" title="Atribua custo e economia" description="Organize o uso por projeto e por agente. A atribuição acontece pelos headers enviados ao gateway — nenhum conteúdo é lido." />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {(["project", "agent"] as const).map((kind) => (
          <Card key={kind}>
            <CardHeader
              title={kind === "project" ? "Projetos" : "Agentes"}
              action={
                <>
                  {(kind === "project" ? projects.data : agents.data)?.length ? <Badge tone="outline">{(kind === "project" ? projects.data : agents.data)!.length}</Badge> : null}
                  {canWrite ? (
                    <Button size="sm" variant="secondary" onClick={() => setCreating(kind)}>
                      <Plus className="size-3.5" aria-hidden /> Novo
                    </Button>
                  ) : null}
                </>
              }
            />
            <div className="mt-4 border-t border-line">{list(kind)}</div>
          </Card>
        ))}
      </div>
      <Card className="mt-4 p-5">
        <p className="text-[13.5px] font-medium text-fg">Como atribuir no seu código</p>
        <p className="mt-1 text-[13px] text-subtle">Envie os identificadores em cada requisição ao gateway local:</p>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <CodeLine value="x-maindy-project: api-checkout" />
          <CodeLine value="x-maindy-agent: agente-suporte" />
        </div>
      </Card>
      <CreateDialog kind={creating ?? "project"} open={!!creating} onOpenChange={(o) => !o && setCreating(null)} projects={projects.data ?? []} />
      <Dialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Excluir “${confirm?.name ?? ""}”?`}
        description="Os eventos já registrados continuam no histórico com o identificador original."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancelar
            </Button>
            <Button variant="danger" loading={delP.isPending || delA.isPending} onClick={doDelete}>
              Excluir
            </Button>
          </>
        }
      />
    </div>
  );
}
