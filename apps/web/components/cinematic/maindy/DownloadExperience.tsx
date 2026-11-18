"use client";

import Link from "next/link";
import { Apple, ArrowDown, ArrowRight, Check, Copy, Loader2, Monitor, RotateCcw, ShieldAlert, Smartphone } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ReleaseDto, type ReleaseTarget } from "@maindy/contracts";
import { cn } from "@/lib/cn";
import { track } from "@/lib/lp/analytics";
import { detectPlatform, signingNote, TARGET_LABEL, type Platform } from "@/lib/lp/platform";
import { film, firePulse } from "../store";

type Load = { kind: "loading" } | { kind: "error" } | { kind: "ok"; releases: ReleaseDto[] };

const mb = (n: number | null) => (n ? `${(n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB` : "");

/**
 * The conversion act. Detects the visitor's platform, reads the REAL release registry
 * (GET /v1/releases via the same-origin /api proxy) and offers only what exists:
 * an actual installer link, an honest "not published yet" state, or — on phones — a way to
 * continue on the computer. Never a dead button, never an invented store link.
 */
export function DownloadExperience({ onReplay }: { onReplay: () => void }) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [target, setTarget] = useState<ReleaseTarget | null>(null);
  const [confident, setConfident] = useState(false);
  const [started, setStarted] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [copied, setCopied] = useState(false);
  const seen = useRef(false);

  const fetchReleases = useCallback(async () => {
    setLoad({ kind: "loading" });
    try {
      const res = await fetch("/api/v1/releases", { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(String(res.status));
      const parsed = ReleaseDto.array().safeParse(await res.json());
      if (!parsed.success) throw new Error("invalid");
      setLoad({ kind: "ok", releases: parsed.data });
    } catch {
      setLoad({ kind: "error" });
    }
  }, []);

  useEffect(() => {
    fetchReleases();
    detectPlatform().then((d) => {
      setPlatform(d.platform);
      setTarget(d.target);
      setConfident(d.confident);
    });
  }, [fetchReleases]);

  useEffect(() => {
    if (load.kind === "ok" && platform && !seen.current) {
      seen.current = true;
      track("download_impression", { platform, target: target ?? "none" });
    }
  }, [load, platform, target]);

  const hover = (v: boolean) => () => {
    film.ctaHover = v ? 1 : 0;
  };

  const releases = load.kind === "ok" ? load.releases : [];
  const rec = releases.find((r) => r.target === target) ?? null;
  const macs = releases.filter((r) => r.target.startsWith("macos") && r.available);
  const isDesktop = platform === "mac" || platform === "windows";

  function onDownload(r: ReleaseDto) {
    track("download_click", { target: r.target, version: r.version });
    firePulse();
    setStarted(true);
  }

  async function shareLink() {
    const url = `${window.location.origin}/#baixar`;
    track("download_share", { platform: platform ?? "unknown" });
    try {
      if (navigator.share) {
        await navigator.share({ title: "maindy.", text: "Baixar a maindy. no computador", url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2400);
    } catch {}
  }

  return (
    <div className="flex w-full flex-col items-center text-center" onMouseLeave={hover(false)}>
      {/* primary action */}
      {load.kind === "loading" || platform === null ? (
        <div className="inline-flex h-14 items-center gap-2.5 rounded-full border border-white/15 px-7 text-[15px] text-muted" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Verificando a versão para o seu sistema…
        </div>
      ) : load.kind === "error" ? (
        <div className="flex flex-col items-center gap-3" role="alert">
          <p className="text-[14px] text-muted">Não consegui consultar as versões agora.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" onClick={fetchReleases} className="inline-flex h-11 items-center gap-2 rounded-full border border-white/20 px-5 text-[14px] text-fg hover:bg-white/[0.06]">
              <RotateCcw className="size-4" aria-hidden /> Tentar de novo
            </button>
            <Link href="/cadastro" className="inline-flex h-11 items-center gap-2 rounded-full bg-fg px-5 text-[14px] font-medium text-bg">
              Criar conta <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </div>
      ) : isDesktop && rec?.available && rec.url ? (
        <a
          href={rec.url}
          download
          onClick={() => onDownload(rec)}
          onMouseEnter={hover(true)}
          onFocus={hover(true)}
          onBlur={hover(false)}
          className="film-cta group relative inline-flex h-16 items-center gap-3 rounded-full bg-fg pl-6 pr-7 text-bg shadow-[0_18px_60px_-12px_rgba(164,36,255,.85)] transition-[transform,box-shadow] duration-500 ease-out-expo hover:scale-[1.035] hover:shadow-[0_24px_90px_-10px_rgba(199,36,255,1)] focus-visible:scale-[1.035]"
        >
          <span className="relative flex size-9 items-center justify-center rounded-full bg-bg text-fg transition-transform duration-500 group-hover:rotate-[-8deg]">
            {started ? <Check className="size-4" aria-hidden /> : <ArrowDown className="size-4 transition-transform duration-500 group-hover:translate-y-0.5" aria-hidden />}
          </span>
          <span className="flex flex-col items-start leading-tight">
            <span className="text-[17px] font-semibold tracking-[-0.02em]">{started ? "Download iniciado" : "Baixar maindy."}</span>
            <span className="text-[12px] text-bg/65">
              {TARGET_LABEL[rec.target]} · v{rec.version} · {mb(rec.sizeBytes)}
            </span>
          </span>
        </a>
      ) : platform === "windows" ? (
        <div className="flex max-w-md flex-col items-center gap-3">
          <p className="flex items-center gap-2 text-[15px] text-fg">
            <Monitor className="size-4 text-muted" aria-hidden /> A versão para Windows ainda não foi publicada.
          </p>
          <p className="text-[13.5px] leading-relaxed text-muted">Crie sua conta: quando o instalador for liberado, ele aparece na sua área de downloads.</p>
          <Link href="/cadastro" onMouseEnter={hover(true)} className="inline-flex h-12 items-center gap-2 rounded-full bg-fg px-6 text-[15px] font-medium text-bg">
            Criar conta <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      ) : (
        <div className="flex max-w-md flex-col items-center gap-3">
          <p className="flex items-center gap-2 text-[15px] text-fg">
            <Smartphone className="size-4 text-muted" aria-hidden /> A maindy. roda no seu computador.
          </p>
          <p className="text-[13.5px] leading-relaxed text-muted">
            Disponível para macOS{macs.length ? "" : " em breve"}; Windows em preparação. Envie o link para abrir no computador ou crie sua conta agora.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" onClick={shareLink} className="inline-flex h-12 items-center gap-2 rounded-full bg-fg px-5 text-[15px] font-medium text-bg">
              {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
              {copied ? "Link copiado" : "Enviar link para o computador"}
            </button>
            <Link href="/cadastro" className="inline-flex h-12 items-center gap-2 rounded-full border border-white/20 px-5 text-[15px] text-fg">
              Criar conta
            </Link>
          </div>
        </div>
      )}

      {/* honest fine print + alternatives */}
      {load.kind === "ok" && isDesktop && rec?.available ? (
        <div className="mt-4 max-w-[34rem] space-y-2 text-[12.5px] leading-relaxed text-muted">
          {!confident && platform === "mac" ? <p>Não dá para saber pelo navegador se o seu Mac é Apple Silicon ou Intel. Se for Intel, escolha abaixo.</p> : null}
          {(() => {
            const n = signingNote(rec);
            return (
              <p className={cn("flex items-start justify-center gap-1.5", n.tone === "warn" ? "text-warning/90" : "text-success")}>
                <ShieldAlert className="mt-[3px] size-3.5 shrink-0" aria-hidden />
                <span className="text-left">{n.text}</span>
              </p>
            );
          })()}
          <p>O app pede login: use sua conta maindy. ou <Link className="text-fg underline decoration-violet underline-offset-4" href="/cadastro">crie uma agora</Link>.</p>
        </div>
      ) : null}

      {started ? (
        <ol className="mt-4 grid max-w-[40rem] gap-1.5 text-left text-[13px] text-muted sm:grid-cols-2" aria-live="polite">
          {["Abra o arquivo .dmg baixado.", "Arraste a maindy. para Aplicativos.", "Na primeira abertura, libere em Privacidade e Segurança.", "Aprove o pareamento no navegador e pronto."].map((s, i) => (
            <li key={s} className="flex gap-2">
              <span className="font-mono text-[11px] text-subtle">0{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13.5px]">
        {load.kind === "ok" ? (
          <button type="button" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll} className="text-muted underline decoration-line-strong underline-offset-4 hover:text-fg">
            Outras plataformas
          </button>
        ) : null}
        <button type="button" onClick={onReplay} className="inline-flex items-center gap-1.5 text-muted hover:text-fg">
          <RotateCcw className="size-3.5" aria-hidden /> Explorar novamente
        </button>
      </div>

      {showAll && load.kind === "ok" ? (
        <ul className="mt-4 w-full max-w-[34rem] divide-y divide-white/[0.06] rounded-[18px] border border-white/[0.08] bg-[rgba(10,8,34,.94)] text-left">
          {releases.map((r) => (
            <li key={r.target} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="flex items-center gap-2.5 text-[13.5px] text-fg">
                {r.target.startsWith("macos") ? <Apple className="size-4 text-muted" aria-hidden /> : <Monitor className="size-4 text-muted" aria-hidden />}
                {TARGET_LABEL[r.target]}
              </span>
              {r.available && r.url ? (
                <a href={r.url} download onClick={() => onDownload(r)} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/15 px-3 text-[12.5px] text-fg hover:bg-white/[0.06]">
                  <ArrowDown className="size-3.5" aria-hidden /> v{r.version} · {mb(r.sizeBytes)}
                </a>
              ) : (
                <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-subtle">ainda não disponível</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
