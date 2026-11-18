"use client";
import { useState } from "react";
import { Download, KeyRound, Moon, ShieldAlert, Sun, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { qk, useMe } from "@/lib/api/hooks";
import { MeDto } from "@maindy/contracts";
import { api, apiUrl, apiVoid, errorMessage, ApiClientError } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast";
import { PageIntro } from "../page-intro";
import { DevicesCard, SessionsCard } from "../sessions-devices";
import { useTheme, type Theme } from "../theme";
import { formatDate } from "../format";

const roleLabel: Record<string, string> = { owner: "Proprietário", admin: "Administrador", member: "Membro", viewer: "Leitura" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 px-5 py-3.5 sm:grid-cols-[200px_1fr] sm:items-center sm:gap-4">
      <dt className="text-[13px] text-subtle">{label}</dt>
      <dd className="min-w-0 text-[13.5px] text-fg">{children}</dd>
    </div>
  );
}

function NameEditor({ name }: { name: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  if (!editing) {
    return (
      <span className="flex items-center justify-between gap-3">
        <span className="truncate">{name}</span>
        <Button variant="ghost" size="sm" onClick={() => { setValue(name); setEditing(true); }}>Editar</Button>
      </span>
    );
  }
  async function save() {
    setBusy(true);
    try {
      const me = await api("/v1/me", MeDto, { method: "PATCH", body: { name: value } });
      qc.setQueryData(qk.me, me);
      setEditing(false);
      toast({ tone: "success", title: "Perfil atualizado" });
    } catch (e) {
      toast({ tone: "error", title: "Não foi possível salvar", description: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <Input aria-label="Nome" value={value} onChange={(e) => setValue(e.target.value)} minLength={2} maxLength={120} required autoFocus className="h-9" />
      <Button type="submit" size="sm" loading={busy}>Salvar</Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancelar</Button>
    </form>
  );
}

export function SettingsScreen() {
  const { data: me } = useMe();
  const { theme, setTheme } = useTheme();
  const toast = useToast();
  const [sending, setSending] = useState(false);
  const [del, setDel] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [password, setPassword] = useState("");
  const [delBusy, setDelBusy] = useState(false);
  const [delErr, setDelErr] = useState<string | null>(null);
  if (!me) return null;

  async function sendReset() {
    setSending(true);
    try {
      await apiVoid("/v1/auth/forgot-password", { method: "POST", body: { email: me!.user.email } });
      toast({ tone: "success", title: "Link enviado", description: `Abra o e-mail enviado para ${me!.user.email} para definir a nova senha.` });
    } catch (e) {
      toast({ tone: "error", title: "Não foi possível enviar", description: errorMessage(e) });
    } finally {
      setSending(false);
    }
  }

  async function deleteAccount() {
    setDelBusy(true);
    setDelErr(null);
    try {
      await apiVoid("/v1/account", { method: "DELETE", body: { confirm: "EXCLUIR", password } });
      window.location.assign("/?conta=excluida");
    } catch (e) {
      setDelErr(e instanceof ApiClientError && e.code === "invalid_credentials" ? "Senha incorreta." : errorMessage(e));
      setDelBusy(false);
    }
  }

  return (
    <div>
      <PageIntro eyebrow="Configurações" title="Conta, segurança e dados" />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Perfil" description="Dados da sua conta e da organização." />
          <dl className="mt-3 divide-y divide-line border-t border-line">
            <Row label="Nome"><NameEditor name={me.user.name} /></Row>
            <Row label="E-mail">
              <span className="flex flex-wrap items-center gap-2">
                <span className="truncate">{me.user.email}</span>
                {me.user.emailVerified ? <Badge tone="success" className="h-5 text-[11px]">verificado</Badge> : <Badge tone="warning" className="h-5 text-[11px]">não verificado</Badge>}
              </span>
            </Row>
            <Row label="Organização">{me.organization.name}</Row>
            <Row label="Papel">{roleLabel[me.role] ?? me.role}</Row>
            <Row label="Conta criada em">{formatDate(me.user.createdAt)}</Row>
          </dl>
        </Card>
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Senha" description="Por segurança, a troca é feita por um link enviado ao seu e-mail. Ao redefinir, todas as sessões são encerradas." />
            <div className="p-5">
              <Button variant="secondary" onClick={sendReset} loading={sending}>
                <KeyRound className="size-4" aria-hidden /> Enviar link para trocar a senha
              </Button>
            </div>
          </Card>
          <Card>
            <CardHeader title="Aparência" description="O painel suporta tema claro e escuro. A preferência fica salva neste navegador." />
            <div className="p-5">
              <Segmented<Theme>
                label="Tema"
                value={theme}
                onChange={setTheme}
                options={[
                  { value: "dark", label: "Escuro" },
                  { value: "light", label: "Claro" },
                ]}
              />
              <span className="ml-3 inline-flex items-center text-subtle">{theme === "dark" ? <Moon className="size-4" aria-hidden /> : <Sun className="size-4" aria-hidden />}</span>
            </div>
          </Card>
        </div>
        <SessionsCard />
        <DevicesCard />
        <Card className="xl:col-span-2">
          <CardHeader title="Seus dados (LGPD)" description="Exporte tudo o que guardamos sobre você e sua organização, ou exclua sua conta. Nunca guardamos prompts nem segredos de provedores." />
          <div className="grid gap-4 p-5 md:grid-cols-2">
            <div className="rounded-[14px] border border-line p-4">
              <p className="text-[14px] font-medium text-fg">Exportar dados</p>
              <p className="mt-1 text-[13px] text-subtle">Arquivo JSON com perfil, organização, assinatura, dispositivos, políticas e metadados de uso.</p>
              <a
                href={apiUrl("/v1/account/export")}
                download
                className="mt-4 inline-flex h-9 items-center gap-2 rounded-[12px] border border-line-strong bg-surface-2 px-3.5 text-[13px] font-medium text-fg hover:bg-surface-3"
              >
                <Download className="size-4" aria-hidden /> Baixar exportação
              </a>
            </div>
            <div className="rounded-[14px] border border-[color-mix(in_oklab,var(--m-error)_30%,transparent)] p-4">
              <p className="flex items-center gap-2 text-[14px] font-medium text-fg">
                <ShieldAlert className="size-4 text-error" aria-hidden /> Excluir conta
              </p>
              <p className="mt-1 text-[13px] text-subtle">Remove sua conta e anonimiza registros. Se você for o único proprietário, a organização também é excluída e a assinatura cancelada.</p>
              <Button variant="danger" size="sm" className="mt-4" onClick={() => setDel(true)}>
                <Trash2 className="size-3.5" aria-hidden /> Excluir minha conta
              </Button>
            </div>
          </div>
        </Card>
      </div>
      <Dialog
        open={del}
        onOpenChange={(o) => {
          setDel(o);
          if (!o) {
            setConfirm("");
            setPassword("");
            setDelErr(null);
          }
        }}
        title="Excluir conta definitivamente?"
        description="Esta ação não pode ser desfeita. Exporte seus dados antes, se precisar deles."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDel(false)}>
              Cancelar
            </Button>
            <Button variant="danger" disabled={confirm !== "EXCLUIR" || !password} loading={delBusy} onClick={deleteAccount} data-testid="confirm-delete-account">
              Excluir conta
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label={<>Digite <strong className="font-mono text-fg">EXCLUIR</strong> para confirmar</>}>{({ id }) => <Input id={id} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />}</Field>
          <Field label="Sua senha" error={delErr}>{({ id, invalid }) => <Input id={id} type="password" autoComplete="current-password" value={password} aria-invalid={invalid} onChange={(e) => setPassword(e.target.value)} />}</Field>
        </div>
      </Dialog>
    </div>
  );
}
