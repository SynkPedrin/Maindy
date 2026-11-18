import { LogOut, Power, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { bridge, errorMessage } from "../../bridge";
import { gatewayLabel, useAction, useApp } from "../../data";
import type { SettingsPatch } from "../../types";
import { ActionMsg, Card, StatusDot, Toggle } from "../../ui";

function UrlField({ label, value, field, disabled, hint }: { label: string; value: string; field: "apiUrl" | "webUrl"; disabled?: boolean; hint?: string }) {
  const { reload } = useApp();
  const [v, setV] = useState(value);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  return (
    <form
      className="field"
      onSubmit={async (e) => {
        e.preventDefault();
        setErr(null);
        setOk(false);
        try {
          await bridge().settingsUpdate({ [field]: v } as SettingsPatch);
          await reload();
          setOk(true);
        } catch (x) {
          setErr(errorMessage(x));
        }
      }}
    >
      <label htmlFor={field}>{label}</label>
      <div className="field-row">
        <input id={field} value={v} onChange={(e) => setV(e.target.value)} disabled={disabled} spellCheck={false} />
        <button type="submit" className="btn btn-sm" disabled={disabled || v === value}>
          Salvar
        </button>
      </div>
      {hint && <span className="field-hint">{hint}</span>}
      {err && <span className="field-err">{err}</span>}
      {ok && <span className="field-ok">Salvo.</span>}
    </form>
  );
}

export function SettingsSection() {
  const { boot, gateway, reload, demo } = useApp();
  const s = boot.settings;
  const [err, setErr] = useState<string | null>(null);
  const [confirmOut, setConfirmOut] = useState(false);
  const [autostart, setAutostart] = useState(boot.autostart);
  const gwAct = useAction();
  const launcherAct = useAction();
  const sysAct = useAction();

  const patch = (act: ReturnType<typeof useAction>, p: SettingsPatch, ok: string) =>
    act.run(async () => {
      await bridge().settingsUpdate(p);
      await reload();
    }, ok);

  const launcherText =
    boot.launcher.kind === "notch"
      ? `Notch detectado${boot.launcher.notch?.screenName ? ` em “${boot.launcher.notch.screenName}”` : ""} (${Math.round(boot.launcher.notch?.notchW ?? 0)}×${Math.round(boot.launcher.notch?.notchH ?? 0)} pt).`
      : boot.platform === "macos"
        ? "Nenhuma tela com notch conectada agora: o painel rápido abre pelo ícone na barra de menus."
        : "Pílula flutuante + ícone na área de notificação.";

  return (
    <div className="stack settings">
      {err && <div className="error-line">{err}</div>}

      <Card title="Conta e dispositivo">
        <dl className="kv kv-3">
          <dt>Organização</dt>
          <dd>
            <code>{boot.organizationId ?? "—"}</code>
          </dd>
          <dt>Dispositivo</dt>
          <dd>
            <code>{boot.deviceId ?? "—"}</code>
          </dd>
          <dt>Token</dt>
          <dd>{boot.paired ? (boot.platform === "windows" ? "no Gerenciador de Credenciais" : "no Keychain do macOS") : "não pareado"}</dd>
        </dl>
        <UrlField label="URL da API" value={s.apiUrl} field="apiUrl" disabled={boot.paired} hint={boot.paired ? "Desconecte para trocar de servidor." : "Padrão: http://localhost:4100"} />
        <UrlField label="URL do painel web" value={s.webUrl} field="webUrl" hint="Usada para faturamento, relatórios e aprovação de dispositivos." />
        {boot.paired &&
          (confirmOut ? (
            <div className="confirm">
              <p>Remover o token deste computador (Keychain/Credential Manager) e o arquivo do gateway? Para revogar no servidor, use Dispositivos no painel web.</p>
              <div className="row">
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={async () => {
                    try {
                      await bridge().signOut();
                      await reload();
                    } catch (e) {
                      setErr(errorMessage(e));
                    }
                  }}
                >
                  Desconectar
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setConfirmOut(false)}>
                  Cancelar
                </button>
                <button type="button" className="link" onClick={() => void bridge().openWeb("devices")}>
                  Revogar no painel web →
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmOut(true)}>
              <LogOut size={15} aria-hidden /> Desconectar este computador
            </button>
          ))}
      </Card>

      <Card title="Gateway local">
        <div className="gw-status">
          <StatusDot tone={gateway.healthy ? "ok" : gateway.phase === "crashed" ? "error" : "idle"} />
          <strong>{gatewayLabel(gateway)}</strong>
          {gateway.pid && <span className="muted">pid {gateway.pid}</span>}
          {gateway.restarts > 0 && <span className="muted">{gateway.restarts} reinício(s)</span>}
        </div>
        {gateway.lastError && <p className="field-err">{gateway.lastError}</p>}
        <Toggle
          label="Ativar gateway local"
          checked={s.gatewayLocal}
          disabled={gwAct.busy || (!gateway.installed && !s.gatewayLocal)}
          onChange={(v) =>
            void gwAct.run(async () => {
              const g = await bridge().gatewaySetEnabled(v);
              await reload();
              return g;
            }, (g) => (v ? (g.healthy ? "Gateway local ativo." : "Gateway local iniciando…") : "Gateway local desativado e device.json apagado."))
          }
          description={
            gateway.installed ? (
              <>
                Inicia o proxy ORBIT em <code>127.0.0.1:8787</code> e o reinicia se cair. <b>Compromisso de segurança:</b> o gateway é outro processo e
                precisa do token do dispositivo para enviar metadados à nuvem, então gravamos uma cópia em <code>{boot.maindyHome}/device.json</code>{" "}
                (permissão 0600, só seu usuário). Desativar ou desconectar apaga o arquivo.
              </>
            ) : (
              "Gateway local não instalado nesta versão do app. O restante do app funciona normalmente."
            )
          }
        />
        <ActionMsg s={gwAct} />
      </Card>

      <Card title="Launcher">
        <p className="muted">{launcherText}</p>
        {boot.platform === "macos" && (
          <Toggle
            label="Mostrar no notch"
            checked={s.notchLauncher}
            onChange={(v) => void patch(launcherAct, { notchLauncher: v }, v ? "Launcher no notch ligado." : "Launcher no notch desligado: use o ícone da barra de menus.")}
            description="Pílula preta discreta junto à câmera, sem cobrir menus. Desligado: só o ícone na barra de menus."
          />
        )}
        {boot.platform === "windows" && (
          <Toggle label="Pílula sempre no topo" checked={s.pillAlwaysOnTop} onChange={(v) => void patch(launcherAct, { pillAlwaysOnTop: v }, "Preferência salva.")} />
        )}
        <Toggle
          label="Modo silencioso"
          checked={s.silentMode}
          onChange={(v) => void patch(launcherAct, { silentMode: v }, v ? "Modo silencioso ligado." : "Modo silencioso desligado.")}
          description="Launcher mínimo, sem animação e sem notificações."
        />
        <ActionMsg s={launcherAct} />
      </Card>

      <Card title="Sistema">
        <Toggle
          label="Iniciar com o sistema"
          checked={autostart}
          onChange={(v) =>
            void sysAct.run(async () => {
              const r = await bridge().autostartSet(v);
              setAutostart(r);
              return r;
            }, (r) => (r ? "A maindy. vai iniciar com o sistema (só no launcher)." : "Início automático desligado."))
          }
          description="Desligado por padrão. Ao iniciar com o sistema, o app abre só no launcher."
        />
        <Toggle
          label="Modo demonstração"
          checked={demo}
          onChange={(v) => void patch(sysAct, { demoMode: v }, v ? "Modo demonstração ligado." : "Modo demonstração desligado.")}
          description="Mostra dados simulados, sempre rotulados “Demonstração — dados simulados”. Nada é enviado à sua conta."
        />
        <ActionMsg s={sysAct} />
      </Card>

      <Card title="Privacidade">
        <ul className="bullets">
          <li>
            <ShieldCheck size={14} aria-hidden /> Prompts não saem desta máquina: a nuvem recebe só metadados (tokens, custo, hashes).
          </li>
          <li>
            <ShieldCheck size={14} aria-hidden /> O token do dispositivo nunca é exposto à interface; todas as chamadas à API são feitas pelo núcleo nativo.
          </li>
          <li>
            <ShieldCheck size={14} aria-hidden /> O launcher não captura a tela nem lê outras janelas; não pede gravação de tela nem acessibilidade.
          </li>
        </ul>
        <p className="muted">
          Versão {boot.version} · {boot.platform} {boot.arch}
        </p>
        <button type="button" className="btn btn-ghost" onClick={() => void bridge().quit()}>
          <Power size={15} aria-hidden /> Sair da maindy.
        </button>
      </Card>
    </div>
  );
}
