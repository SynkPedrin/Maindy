"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Apple, ArrowLeft, ArrowRight, Check, Clapperboard, Cpu, Download, FileCheck2, Monitor, ShieldAlert, ShieldCheck } from "lucide-react";
import type { ReleaseDto, ReleaseTarget } from "@maindy/contracts";
import { useReleases, useUpdateOnboarding } from "@/lib/api/hooks";
import { errorMessage } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { ErrorState } from "@/components/ui/empty-state";
import { SkeletonCard } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { PageIntro } from "../page-intro";
import { formatBytes, formatDate } from "../format";
import { VIDEO_SCRIPT_DURATION, storyboard, tutorialSteps } from "../tutorial-content";

const TARGETS: { target: ReleaseTarget; label: string; sub: string; os: "mac" | "win" }[] = [
  { target: "macos-arm64", label: "macOS", sub: "Apple Silicon (M1–M4)", os: "mac" },
  { target: "macos-x64", label: "macOS", sub: "Intel", os: "mac" },
  { target: "windows-x64", label: "Windows", sub: "x64", os: "win" },
  { target: "windows-arm64", label: "Windows", sub: "ARM64", os: "win" },
];

type UADataLike = { platform?: string; getHighEntropyValues?: (h: string[]) => Promise<{ architecture?: string; bitness?: string }> };

/** Non-authoritative OS guess. Browsers hide Apple Silicon vs Intel; we say so. */
async function detectTarget(): Promise<{ target: ReleaseTarget | null; confident: boolean }> {
  const nav = navigator as Navigator & { userAgentData?: UADataLike };
  const ua = navigator.userAgent;
  const platform = nav.userAgentData?.platform ?? navigator.platform ?? "";
  const isMac = /mac/i.test(platform) || /Macintosh|Mac OS X/.test(ua);
  const isWin = /win/i.test(platform) || /Windows/.test(ua);
  let arch: string | undefined;
  try {
    arch = (await nav.userAgentData?.getHighEntropyValues?.(["architecture", "bitness"]))?.architecture;
  } catch {}
  if (isMac) {
    if (arch === "arm") return { target: "macos-arm64", confident: true };
    if (arch === "x86") return { target: "macos-x64", confident: true };
    return { target: "macos-arm64", confident: false };
  }
  if (isWin) {
    if (arch === "arm" || /ARM64|aarch64/i.test(ua)) return { target: "windows-arm64", confident: !!arch };
    return { target: "windows-x64", confident: !!arch };
  }
  return { target: null, confident: false };
}

function signingInfo(r: ReleaseDto, os: "mac" | "win"): { label: string; tone: "success" | "warning"; body: string } {
  switch (r.signing) {
    case "notarized":
      return { label: "Assinado e notarizado pela Apple", tone: "success", body: "O macOS abre normalmente." };
    case "developer_id":
      return { label: "Assinado com Developer ID (não notarizado)", tone: "warning", body: "O macOS pode pedir confirmação na primeira abertura." };
    case "authenticode":
      return { label: "Assinado (Authenticode)", tone: "success", body: "O Windows identifica o editor do instalador." };
    case "adhoc":
      return { label: "Assinatura ad-hoc — sem Developer ID", tone: "warning", body: os === "mac" ? "Ainda sem Developer ID da Apple: na primeira abertura o macOS bloqueia o app. Libere em Ajustes do Sistema → Privacidade e Segurança → \"Abrir Mesmo Assim\" (no macOS 15 ou posterior o clique direito → Abrir não basta)." : "O Windows pode exibir um aviso." };
    default:
      return os === "mac"
        ? { label: "Não assinado — o macOS pedirá confirmação", tone: "warning", body: "Abra com clique direito → Abrir, ou em Ajustes do Sistema → Privacidade e Segurança → Abrir mesmo assim." }
        : { label: "Não assinado — o SmartScreen pode exibir um aviso", tone: "warning", body: "Clique em “Mais informações” → “Executar assim mesmo” se confiar no arquivo (confira o SHA-256)." };
  }
}

function InstallSteps({ os, r }: { os: "mac" | "win"; r: ReleaseDto }) {
  const file = r.fileName ?? (os === "mac" ? "maindy.dmg" : "maindy-setup.exe");
  const steps =
    os === "mac"
      ? [`Abra ${file}.`, "Arraste a maindy. para a pasta Aplicativos.", "Abra a maindy. em Aplicativos. Se o macOS disser que não pôde verificar o app, clique em OK, vá em Ajustes do Sistema → Privacidade e Segurança, role até \"maindy foi bloqueado\" e clique em \"Abrir Mesmo Assim\" (pede sua senha uma vez).", "A maindy. não aparece no Dock: ela vive no notch (MacBook com notch) ou na barra de menus, no ícone da orb. Clique nela para abrir o painel.", "O app mostra um código de pareamento — aprove no navegador."]
      : [`Execute ${file}.`, "Siga o instalador (não exige privilégios de administrador quando instalado só para você).", "Abra a maindy. pelo menu Iniciar ou pela pílula na bandeja.", "O app mostra um código de pareamento — aprove no navegador."];
  const verify = os === "mac" ? `shasum -a 256 ~/Downloads/${file}` : `Get-FileHash $HOME\\Downloads\\${file} -Algorithm SHA256`;
  return (
    <div>
      <ol className="space-y-2.5">
        {steps.map((s, i) => (
          <li key={s} className="flex gap-3 text-[13px] leading-relaxed text-muted">
            <span className="m-num grid size-6 shrink-0 place-items-center rounded-full border border-line-strong text-[11.5px] text-subtle">{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
      <p className="mb-2 mt-4 text-[12.5px] text-subtle">Conferir a integridade do arquivo:</p>
      <div className="flex items-center gap-2 rounded-[12px] border border-line bg-bg-deep/70 py-1.5 pl-3 pr-1.5">
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-[12px] text-muted">{verify}</code>
        <CopyButton value={verify} />
      </div>
    </div>
  );
}

function InteractiveTutorial() {
  const [i, setI] = useState(0);
  const [done, setDone] = useState<number[]>([]);
  const step = tutorialSteps[i];
  return (
    <Card>
      <CardHeader title="Tutorial interativo" description="Siga no seu ritmo. Cada etapa leva para a tela certa do painel." action={<Badge tone="outline">{done.length}/{tutorialSteps.length} feitas</Badge>} />
      <div className="grid grid-cols-1 gap-0 p-5 md:grid-cols-[220px_1fr] md:gap-6">
        <ol className="mb-4 flex gap-1.5 overflow-x-auto md:mb-0 md:flex-col md:overflow-visible" aria-label="Etapas do tutorial">
          {tutorialSteps.map((s, idx) => (
            <li key={s.title} className="shrink-0">
              <button
                type="button"
                onClick={() => setI(idx)}
                aria-current={idx === i ? "step" : undefined}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-[13px] transition-colors",
                  idx === i ? "bg-surface-2 text-fg" : "text-subtle hover:text-fg",
                )}
              >
                <span
                  className={cn(
                    "m-num grid size-5 shrink-0 place-items-center rounded-full text-[11px]",
                    done.includes(idx) ? "bg-[color-mix(in_oklab,var(--m-success)_18%,transparent)] text-success" : idx === i ? "bg-violet text-white" : "border border-line-strong",
                  )}
                >
                  {done.includes(idx) ? <Check className="size-3" /> : idx + 1}
                </span>
                <span className="hidden md:inline">{s.title}</span>
              </button>
            </li>
          ))}
        </ol>
        <div aria-live="polite">
          <p className="m-label">Etapa {i + 1} de {tutorialSteps.length}</p>
          <h3 className="mt-2 text-[17px] font-semibold text-fg">{step.title}</h3>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{step.body}</p>
          <ul className="mt-3 space-y-1.5">
            {step.details.map((d) => (
              <li key={d} className="flex gap-2 text-[13px] text-subtle">
                <Check className="mt-0.5 size-3.5 shrink-0 text-subtle" aria-hidden />
                {d}
              </li>
            ))}
          </ul>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" disabled={i === 0} onClick={() => setI(i - 1)}>
              <ArrowLeft className="size-3.5" aria-hidden /> Anterior
            </Button>
            {step.href ? (
              <ButtonLink href={step.href} variant="secondary" size="sm">
                {step.cta}
              </ButtonLink>
            ) : null}
            <Button
              size="sm"
              className="ml-auto"
              onClick={() => {
                setDone((d) => (d.includes(i) ? d : [...d, i]));
                if (i < tutorialSteps.length - 1) setI(i + 1);
              }}
            >
              {i < tutorialSteps.length - 1 ? (
                <>
                  Concluir e avançar <ArrowRight className="size-3.5" aria-hidden />
                </>
              ) : (
                "Concluir tutorial"
              )}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

export function DownloadScreen() {
  const q = useReleases();
  const onboarding = useUpdateOnboarding();
  const [detected, setDetected] = useState<{ target: ReleaseTarget | null; confident: boolean } | null>(null);
  const [selected, setSelected] = useState<ReleaseTarget | null>(null);

  useEffect(() => {
    detectTarget().then((d) => {
      setDetected(d);
      setSelected((s) => s ?? d.target ?? "macos-arm64");
    });
  }, []);

  const byTarget = useMemo(() => new Map((q.data ?? []).map((r) => [r.target, r])), [q.data]);
  const sel = selected ?? "macos-arm64";
  const release = byTarget.get(sel);
  const meta = TARGETS.find((t) => t.target === sel)!;

  return (
    <div>
      <PageIntro
        eyebrow="Download"
        title="Instale a maindy. no seu computador"
        description="O app roda o gateway local (127.0.0.1:8787) e o ORBIT Engine na sua máquina. Prompts e chaves não saem dela."
      />
      {q.isPending ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.4fr]">
          <SkeletonCard lines={5} />
          <SkeletonCard lines={8} />
        </div>
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)]">
          <Card>
            <CardHeader
              title="Escolha o instalador"
              description={
                detected?.target
                  ? `Detectamos ${TARGETS.find((t) => t.target === detected.target)?.label} ${detected.confident ? TARGETS.find((t) => t.target === detected.target)?.sub : "(arquitetura não confirmada pelo navegador)"} — confirme abaixo.`
                  : "Não conseguimos identificar seu sistema. Escolha manualmente."
              }
            />
            <div role="radiogroup" aria-label="Sistema operacional" className="grid gap-2 p-5">
              {TARGETS.map((t) => {
                const r = byTarget.get(t.target);
                const active = t.target === sel;
                const Icon = t.os === "mac" ? Apple : Monitor;
                return (
                  <button
                    key={t.target}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    data-testid={`target-${t.target}`}
                    onClick={() => setSelected(t.target)}
                    className={cn(
                      "flex items-center gap-3 rounded-[14px] border px-3.5 py-3 text-left transition-colors",
                      active ? "border-[color-mix(in_oklab,var(--m-neon)_50%,transparent)] bg-[color-mix(in_oklab,var(--m-neon)_7%,var(--m-surface-1))]" : "border-line hover:border-line-strong",
                    )}
                  >
                    <Icon className="size-5 shrink-0 text-muted" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-medium text-fg">
                        {t.label} <span className="font-normal text-subtle">· {t.sub}</span>
                      </span>
                      <span className="block text-[12px] text-subtle">{r ? (r.available ? `Versão ${r.version}` : "Ainda não disponível") : "Sem informação de release"}</span>
                    </span>
                    {detected?.target === t.target ? <Badge tone="outline" className="h-5 text-[10.5px]">detectado</Badge> : null}
                    {r?.available ? <span className="size-2 rounded-full bg-success" aria-label="disponível" /> : null}
                  </button>
                );
              })}
            </div>
          </Card>

          <Card data-testid="release-details">
            {!release || !release.available ? (
              <div className="flex h-full flex-col p-6">
                <div className="flex items-center gap-2">
                  <Badge tone="neutral" data-testid="release-unavailable">
                    Ainda não disponível
                  </Badge>
                  {release ? <span className="text-[12.5px] text-subtle">versão planejada {release.version}</span> : null}
                </div>
                <h3 className="mt-4 text-[18px] font-semibold text-fg">
                  {meta.label} · {meta.sub}
                </h3>
                <p className="mt-2 max-w-md text-[13.5px] leading-relaxed text-muted">
                  Ainda não publicamos um instalador real para este alvo. Não há link de download até existir um build verificado — avisaremos por e-mail quando sair.
                </p>
                {release?.changelog.length ? (
                  <div className="mt-5">
                    <p className="m-label mb-2">Previsto</p>
                    <ul className="space-y-1 text-[13px] text-subtle">
                      {release.changelog.map((c) => (
                        <li key={c}>• {c}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <p className="mt-auto pt-6 text-[12.5px] text-subtle">Requisitos mínimos: {release?.minOsVersion ?? (meta.os === "mac" ? "macOS 13+" : "Windows 10+")}</p>
              </div>
            ) : (
              <ReleaseDetails release={release} os={meta.os} title={`${meta.label} · ${meta.sub}`} onDownload={() => onboarding.mutate({ complete: ["app_downloaded"] })} />
            )}
          </Card>
        </div>
      )}

      <section className="mt-10" aria-labelledby="tutorial-title">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="m-label mb-2">Tutorial</div>
            <h2 id="tutorial-title" className="text-[20px] font-semibold tracking-[-0.02em] text-fg">
              Do download à primeira economia medida
            </h2>
          </div>
        </div>
        <InteractiveTutorial />

        <Card className="mt-4" data-testid="video-script">
          <CardHeader
            eyebrow={
              <span className="inline-flex items-center gap-1.5">
                <Clapperboard className="size-3.5" aria-hidden /> {VIDEO_SCRIPT_DURATION}
              </span>
            }
            title="Roteiro do tutorial em vídeo (gravação pendente)"
            description="O vídeo será gravado com captura real do app funcionando. Enquanto isso, publicamos o roteiro e o storyboard completos — sem botão de play até existir um vídeo de verdade."
          />
          <ol className="mt-4 divide-y divide-line border-t border-line">
            {storyboard.map((s) => (
              <li key={s.scene} className="grid grid-cols-1 gap-2 px-5 py-4 md:grid-cols-[180px_1fr_1fr] md:gap-6">
                <div>
                  <p className="text-[13.5px] font-medium text-fg">{s.scene}</p>
                  <p className="m-num mt-0.5 font-mono text-[11.5px] text-subtle">{s.time}</p>
                </div>
                <div>
                  <p className="m-label mb-1 !text-[10px]">Tela</p>
                  <p className="text-[13px] leading-relaxed text-muted">{s.visual}</p>
                </div>
                <div>
                  <p className="m-label mb-1 !text-[10px]">Narração</p>
                  <p className="text-[13px] italic leading-relaxed text-muted">“{s.narration}”</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </section>
    </div>
  );
}

function ReleaseDetails({ release: r, os, title, onDownload }: { release: ReleaseDto; os: "mac" | "win"; title: string; onDownload: () => void }) {
  const sign = signingInfo(r, os);
  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="success" dot>
          Disponível
        </Badge>
        <span className="text-[12.5px] text-subtle">
          Versão {r.version}
          {r.releasedAt ? ` · ${formatDate(r.releasedAt)}` : ""}
        </span>
      </div>
      <h3 className="mt-4 text-[18px] font-semibold text-fg">{title}</h3>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {r.url ? (
          <ButtonLink href={r.url} external size="lg" onClick={onDownload} download data-testid="download-button">
            <Download className="size-4" aria-hidden /> Baixar {r.fileName ?? ""}
          </ButtonLink>
        ) : null}
        <span className="text-[12.5px] text-subtle">{formatBytes(r.sizeBytes)}</span>
      </div>
      <dl className="mt-6 grid gap-4 text-[13px] sm:grid-cols-2">
        <div>
          <dt className="m-label mb-1 !text-[10px]">Requisitos mínimos</dt>
          <dd className="flex items-center gap-2 text-muted">
            <Cpu className="size-3.5 text-subtle" aria-hidden /> {r.minOsVersion}
          </dd>
        </div>
        <div>
          <dt className="m-label mb-1 !text-[10px]">Assinatura</dt>
          <dd className={cn("flex items-start gap-2", sign.tone === "success" ? "text-success" : "text-warning")} data-testid="signing-status">
            {sign.tone === "success" ? <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden /> : <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />}
            <span>
              {sign.label}
              <span className="mt-0.5 block text-[12px] text-subtle">{sign.body}</span>
            </span>
          </dd>
        </div>
        {r.sha256 ? (
          <div className="sm:col-span-2">
            <dt className="m-label mb-1 !text-[10px]">SHA-256</dt>
            <dd className="flex items-center gap-2 rounded-[12px] border border-line bg-bg-deep/70 py-1.5 pl-3 pr-1.5">
              <FileCheck2 className="size-3.5 shrink-0 text-subtle" aria-hidden />
              <code className="min-w-0 flex-1 break-all font-mono text-[11.5px] text-muted">{r.sha256}</code>
              <CopyButton value={r.sha256} label="Copiar hash" />
            </dd>
          </div>
        ) : null}
      </dl>
      {r.changelog.length ? (
        <div className="mt-6">
          <p className="m-label mb-2 !text-[10px]">Novidades da versão</p>
          <ul className="space-y-1.5 text-[13px] text-muted">
            {r.changelog.map((c) => (
              <li key={c} className="flex gap-2">
                <span aria-hidden className="mt-[8px] size-1 shrink-0 rounded-full bg-subtle" />
                {c}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="mt-6 border-t border-line pt-5">
        <p className="mb-3 text-[13.5px] font-medium text-fg">Como instalar</p>
        <InstallSteps os={os} r={r} />
      </div>
      <p className="mt-5 text-[12.5px] text-subtle">
        Depois de instalar, o app abre a{" "}
        <Link href="/app/onboarding" className="text-fg underline-offset-4 hover:underline">
          etapa de pareamento
        </Link>
        .
      </p>
    </div>
  );
}
