import { ExternalLink, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { bridge, errorMessage } from "../bridge";
import { useApp } from "../data";
import type { PairStartView } from "../types";
import { Orb, Wordmark } from "../ui";

function ApiUrlInline() {
  const { boot, reload } = useApp();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(boot.settings.apiUrl);
  const [err, setErr] = useState<string | null>(null);
  if (!editing)
    return (
      <span>
        API: <code>{boot.settings.apiUrl}</code>{" "}
        <button type="button" className="link" onClick={() => setEditing(true)}>
          alterar
        </button>
      </span>
    );
  return (
    <form
      className="inline-form"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await bridge().settingsUpdate({ apiUrl: value });
          await reload();
          setEditing(false);
          setErr(null);
        } catch (x) {
          setErr(errorMessage(x));
        }
      }}
    >
      <label className="sr-only" htmlFor="api-url">
        URL da API
      </label>
      <input id="api-url" value={value} onChange={(e) => setValue(e.target.value)} spellCheck={false} autoFocus />
      <button type="submit" className="btn btn-sm">
        Salvar
      </button>
      {err && <span className="pair-error">{err}</span>}
    </form>
  );
}

type Phase = "idle" | "starting" | "waiting" | "approved" | "denied" | "expired" | "error";

export function Pairing() {
  const { boot, reload } = useApp();
  const [phase, setPhase] = useState<Phase>("idle");
  const [start, setStart] = useState<PairStartView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(0);
  const timer = useRef<number | null>(null);
  const deadline = useRef(0);

  const stop = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };

  const poll = useCallback(
    (interval: number) => {
      stop();
      timer.current = window.setTimeout(async () => {
        try {
          const r = await bridge().pairPoll();
          if (r.status === "pending") return poll(r.interval || interval);
          setPhase(r.status === "approved" ? "approved" : r.status);
          if (r.status === "approved") await reload();
        } catch (e) {
          setError(errorMessage(e));
          setPhase("error");
        }
      }, interval * 1000);
    },
    [reload],
  );

  const begin = async () => {
    setError(null);
    setPhase("starting");
    try {
      const s = await bridge().pairStart();
      setStart(s);
      deadline.current = Date.now() + s.expiresIn * 1000;
      setPhase("waiting");
      poll(s.interval);
      // open the approval page right away; the button stays available
      void bridge().openExternal(s.verificationUrlComplete);
    } catch (e) {
      setError(errorMessage(e));
      setPhase("error");
    }
  };

  useEffect(() => {
    if (phase !== "waiting") return;
    const t = window.setInterval(() => setLeft(Math.max(0, Math.round((deadline.current - Date.now()) / 1000))), 1000);
    return () => window.clearInterval(t);
  }, [phase]);

  useEffect(() => () => {
    stop();
    void bridge().pairCancel();
  }, []);

  const mm = String(Math.floor(left / 60)).padStart(1, "0");
  const ss = String(left % 60).padStart(2, "0");

  return (
    <div className="pair">
      <div className="pair-card">
        <div className="pair-brand">
          <Orb size={64} active={phase === "waiting" && !boot.reduceMotion} />
          <Wordmark height={26} />
        </div>
        <h1>Conectar à sua conta</h1>
        <p className="pair-lead">
          Este computador será pareado com a sua organização. O token do dispositivo fica guardado no{" "}
          {boot.platform === "windows" ? "Gerenciador de Credenciais do Windows" : "Keychain do macOS"} — nunca em arquivos de texto.
        </p>

        {boot.sessionRevoked && <div className="pair-warn">Este dispositivo foi desconectado da conta. Gere um novo código para conectar de novo.</div>}
        {boot.keychainError && <div className="pair-warn">{boot.keychainError}</div>}

        {(phase === "idle" || phase === "error" || phase === "denied" || phase === "expired") && (
          <>
            {phase === "denied" && <div className="pair-warn">O pareamento foi recusado no navegador.</div>}
            {phase === "expired" && <div className="pair-warn">O código expirou. Gere um novo.</div>}
            {error && <div className="pair-error">{error}</div>}
            <button type="button" className="btn btn-primary btn-lg" onClick={() => void begin()}>
              {phase === "idle" ? "Gerar código de conexão" : (
                <>
                  <RefreshCw size={16} aria-hidden /> Tentar novamente
                </>
              )}
            </button>
          </>
        )}

        {phase === "starting" && (
          <div className="pair-wait">
            <Loader2 className="spin" size={18} aria-hidden /> Solicitando código…
          </div>
        )}

        {phase === "waiting" && start && (
          <div className="pair-code-box">
            <span className="pair-k">Seu código</span>
            <div className="pair-code" aria-label={`Código ${start.userCode.split("").join(" ")}`}>
              {start.userCode}
            </div>
            <p className="pair-hint">
              Confirme o mesmo código na página de aprovação em <b>{new URL(start.verificationUrl).host}</b>.
            </p>
            <button type="button" className="btn btn-primary" onClick={() => void bridge().openExternal(start.verificationUrlComplete)}>
              <ExternalLink size={16} aria-hidden /> Abrir no navegador
            </button>
            <div className="pair-wait" role="status" aria-live="polite">
              <Loader2 className="spin" size={16} aria-hidden /> Aguardando aprovação · expira em {mm}:{ss}
            </div>
          </div>
        )}

        {phase === "approved" && (
          <div className="pair-ok" role="status">
            <ShieldCheck size={18} aria-hidden /> Dispositivo conectado.
          </div>
        )}

        <div className="pair-foot">
          <ApiUrlInline />
          <button type="button" className="link" onClick={() => void bridge().openWeb("signup")}>
            Criar conta
          </button>
          <button
            type="button"
            className="link"
            onClick={async () => {
              await bridge().settingsUpdate({ demoMode: true });
              await reload();
            }}
          >
            Ver demonstração
          </button>
        </div>
      </div>
    </div>
  );
}
