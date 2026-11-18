"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, RotateCcw, ShieldCheck } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { orbitDetail, provenance } from "@/components/marketing/content";
import type { OrbitDemoData } from "@/lib/lp/orbit-demo";
import { track } from "@/lib/lp/analytics";
import { useFilmFrame } from "../CinematicScrollController";
import { Scene, Slate, Words } from "../Scene";
import { DownloadExperience } from "../maindy/DownloadExperience";
import { FinalPlate } from "../maindy/FinalPlate";
import { MaindyOrbAssistant } from "../maindy/MaindyOrbAssistant";
import { OrbitDemo } from "../maindy/OrbitDemo";
import { ProductDevice } from "../maindy/ProductDevice";
import { film, range } from "../store";
import { SCENE_INDEX } from "../storyboard";
import { goToScene } from "../ui/SceneProgress";

/**
 * Composition grid. Landscape: copy lives in the left column (≤ 44%), the 3D subject owns the right.
 * Portrait: subject in the upper half, copy anchored to the bottom over a scrim. Nothing overlaps.
 */
const frame = "mx-auto w-full max-w-[1440px] px-5 sm:px-8 lg:px-16 xl:px-24";
const leftCol = "w-full lg:w-[44%] xl:w-[40%]";

/* 01 ─────────────────────────────── HERO */
export function HeroScene() {
  return (
    <Scene id="hero" labelledBy="hero-title" stageClassName="film-scrim-left">
      <div className={cn(frame, "flex h-full flex-col justify-end pb-8 pt-24 sm:pb-12 lg:justify-center lg:pb-0")}>
        <div className={leftCol}>
          <div data-r="fade" data-a={-1} data-b={0.3}>
            <p className="m-label mk-fade flex items-center gap-3" style={{ ["--d" as string]: "300ms" }}>
              <span aria-hidden className="relative flex size-2">
                <span className="absolute inset-0 animate-ping rounded-full bg-purple/60 motion-reduce:hidden" />
                <span className="relative size-2 rounded-full bg-purple" />
              </span>
              Powered by ORBIT Engine™
            </p>
          </div>
          <div data-flow-only className="my-10 flex justify-center">
            <Image src="/lp/orb-1254.webp" alt="" width={360} height={360} priority className="h-auto w-[min(62vw,340px)]" />
          </div>
          <h1
            id="hero-title"
            className="film-display mt-6 whitespace-nowrap text-[clamp(2.9rem,5.3vw,5.9rem)] text-fg"
            data-r="words"
            data-a={-1}
            data-b={0.26}
            data-d={0.16}
            aria-label="Sua IA trabalha mais. Você gasta menos."
          >
            {[
              ["Sua", "IA"],
              ["trabalha", "mais."],
              ["Você", "gasta"],
              ["menos."],
            ].map((line, li) => (
              <span key={li} className="block">
                {line.map((w, i) => (
                  <span key={w} aria-hidden className="film-wmask">
                    <span data-w className="inline-block">
                      <span
                        className={cn("film-rise inline-block", w === "menos." && "film-serif mk-ink-violet pr-[0.08em]")}
                        style={{ ["--d" as string]: `${450 + li * 110 + i * 60}ms` }}
                      >
                        {w}
                      </span>
                    </span>
                    {i < line.length - 1 ? " " : null}
                  </span>
                ))}
              </span>
            ))}
          </h1>
          <div data-r="fade" data-a={-1} data-b={0.18}>
            <p className="mk-fade film-lead mt-7 max-w-[28rem] text-[16px] leading-relaxed text-muted sm:text-[17.5px]" style={{ ["--d" as string]: "1000ms" }}>
              Uma camada inteligente que reduz o desperdício de IA em APIs, agentes e ferramentas de desenvolvimento, e prova cada centavo economizado.
            </p>
          </div>
          <div data-r="fade" data-a={-1} data-b={0.18}>
            <div className="mk-fade mt-8 flex flex-wrap items-center gap-3" style={{ ["--d" as string]: "1150ms" }}>
              <Link
                href="/cadastro"
                data-cursor="Começar"
                onClick={() => track("hero_cta", { to: "cadastro" })}
                className="group inline-flex h-12 items-center gap-2 rounded-full bg-fg px-6 text-[15px] font-medium text-bg shadow-[0_12px_40px_-12px_rgba(164,36,255,.9)] transition-shadow hover:shadow-[0_16px_60px_-10px_rgba(199,36,255,1)]"
              >
                Começar agora
                <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <a
                href="#baixar"
                data-cursor="Baixar"
                onClick={(e) => {
                  e.preventDefault();
                  track("hero_cta", { to: "baixar" });
                  goToScene(SCENE_INDEX.final);
                }}
                className="inline-flex h-12 items-center rounded-full border border-white/20 bg-[rgba(8,6,30,.55)] px-6 text-[15px] text-fg transition-colors hover:bg-white/[0.08]"
              >
                Baixar o app
              </a>
            </div>
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-6 hidden justify-center lg:flex" data-film-only data-r="fade" data-a={-1} data-b={0.08}>
          <div className="mk-fade flex flex-col items-center gap-3" style={{ ["--d" as string]: "1500ms" }}>
            <span className="m-label">Role para explorar</span>
            <span aria-hidden className="relative h-10 w-px overflow-hidden bg-white/15">
              <span className="film-cue-line absolute inset-x-0 top-0 h-1/3 bg-fg" />
            </span>
          </div>
        </div>
        <button
          type="button"
          className="film-intro-skip m-label absolute right-5 top-20 rounded-full border border-white/15 px-3 py-1.5 text-muted hover:text-fg sm:right-8 lg:right-16"
          onClick={() => window.dispatchEvent(new Event("maindy:skip-intro"))}
        >
          Pular introdução
        </button>
      </div>
    </Scene>
  );
}

/* 02 ─────────────────────────────── OVERLOAD */
export function OverloadScene() {
  return (
    <Scene id="overload" labelledBy="overload-title" stageClassName="film-scrim-left">
      <div className={cn(frame, "flex h-full flex-col justify-end pb-10 pt-24 lg:justify-center lg:pb-0")}>
        <div className={cn(leftCol, "relative")}>
          <Slate n="01" a={0.05} b={0.92} className="mb-6">
            O custo invisível
          </Slate>
          <div className="grid [&>*]:col-start-1 [&>*]:row-start-1">
            <Words id="overload-title" text={"Cada chamada\ncarrega mais do\nque precisa."} className="film-title text-[clamp(2.3rem,4.6vw,4.9rem)] text-fg" a={0.1} b={0.48} d={0.14} />
            <Words as="p" text={"E a fatura\ncobra por tudo."} accent={["por", "tudo."]} className="film-title text-[clamp(2.3rem,4.6vw,4.9rem)] text-fg" a={0.54} b={0.92} d={0.14} />
          </div>
          <p className="film-lead mt-7 max-w-[26rem] text-[15.5px] leading-relaxed text-muted" data-r="fade" data-a={0.2} data-b={0.88}>
            Contexto reenviado, logs inteiros, agentes em loop, a mesma pergunta duas vezes. Ninguém vê, mas cada token entra na conta.
          </p>
          <p className="m-label mt-5 text-[10px]" data-r="fade" data-a={0.2} data-b={0.88}>
            Cartões: exemplos ilustrativos, não medições
          </p>
        </div>
      </div>
    </Scene>
  );
}

/* 03 ─────────────────────────────── SHIFT (centred beat) */
export function ShiftScene() {
  return (
    <Scene id="shift" labelledBy="shift-title">
      <div className={cn(frame, "relative flex h-full flex-col items-center justify-between pb-[9svh] pt-28 text-center")}>
        <Words
          id="shift-title"
          text={"E se cada token tivesse\num motivo para estar ali?"}
          accent={["motivo"]}
          className="film-title max-w-[22ch] text-[clamp(1.9rem,3.6vw,3.8rem)] text-fg"
          a={0.06}
          b={0.46}
          d={0.13}
        />
        <div className="flex flex-col items-center gap-4">
          <p className="m-label" data-r="fade" data-a={0.6} data-b={0.93}>
            Conheça
          </p>
          <div data-r="scale" data-a={0.64} data-b={0.93} data-d={0.14}>
            <Image src="/brand/wordmark-white.png" alt="maindy." width={888} height={256} className="h-auto w-[min(56vw,380px)]" />
          </div>
        </div>
      </div>
    </Scene>
  );
}

/* 04 ─────────────────────────────── MEET */
export function MeetScene() {
  return (
    <Scene id="meet" labelledBy="meet-title" stageClassName="film-scrim-left">
      <div className={cn(frame, "flex h-full flex-col justify-end pb-10 pt-24 lg:justify-center lg:pb-0")}>
        <div className={cn(leftCol, "relative")}>
          <Slate n="02" a={0.05} b={0.92} className="mb-6">
            A camada maindy.
          </Slate>
          <div className="grid text-[clamp(2.3rem,4.4vw,4.6rem)] [&>*]:col-start-1 [&>*]:row-start-1">
            <Words id="meet-title" text={"Não é mais um\nmodelo de IA."} className="film-title text-fg" a={0.06} b={0.46} d={0.13} />
            <Words as="p" text={"É a camada que\ndecide o que vale\na pena enviar."} accent={["enviar."]} className="film-title text-[0.78em] text-fg" a={0.5} b={0.93} d={0.12} />
          </div>
          <p className="film-lead mt-7 max-w-[28rem] text-[15.5px] leading-relaxed text-muted" data-r="fade" data-a={0.56} data-b={0.93}>
            Um gateway local entre o seu código e o provedor. Suas chaves, seus provedores. A maindy. mede, reduz e prova, sem ler o que não precisa.
          </p>
          <p className="m-label mt-6 hidden items-center gap-2 text-[10px] lg:flex" data-r="fade" data-a={0.12} data-b={0.93}>
            <span aria-hidden className="size-1.5 rounded-full bg-gold" /> Arraste para orbitar · clique no orbe
          </p>
        </div>
      </div>
    </Scene>
  );
}

/* 05 ─────────────────────────────── DEMO */
export function DemoScene({ data }: { data: OrbitDemoData }) {
  return (
    <Scene id="demo" labelledBy="demo-title">
      <div className={cn(frame, "grid h-full items-center gap-6 pb-6 pt-24 max-lg:content-end lg:grid-cols-12")}>
        <div className="max-lg:hidden lg:col-span-5" />
        <div className="lg:col-span-7 lg:pl-4 xl:col-span-6 xl:col-start-7">
          <Slate n="03" a={0.03} b={0.93} className="mb-4">
            Na prática
          </Slate>
          <Words id="demo-title" text={"Você chama.\nA maindy. otimiza."} accent={["otimiza."]} className="film-title text-[clamp(2rem,3.6vw,3.8rem)] text-fg" a={0.04} b={0.93} d={0.1} />
          <div className="mt-5 max-h-[56svh] overflow-y-auto overscroll-contain rounded-[26px] [scrollbar-width:none] lg:max-h-[calc(100svh-16rem)]" data-r="rise" data-a={0.1} data-b={0.93} data-d={0.12}>
            <OrbitDemo data={data} />
          </div>
        </div>
      </div>
    </Scene>
  );
}

/* 06 ─────────────────────────────── ORBIT */
const ORBIT = SCENE_INDEX.orbit;
export function OrbitScene() {
  const [stage, setStage] = useState(0);
  const stageRef = useRef(0);
  useFilmFrame((s) => {
    const local = range(s, ORBIT, ORBIT + 1);
    const i = Math.round(Math.min(4, Math.max(0, local * 5.6 - 0.3)));
    if (i !== stageRef.current) {
      stageRef.current = i;
      setStage(i);
    }
  });
  const st = orbitDetail[stage]!;
  function jump(k: number) {
    const el = document.querySelector<HTMLElement>(`[data-scene="orbit"]`);
    if (!el) return;
    const local = (k + 0.3) / 5.6;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY + local * el.offsetHeight, behavior: "smooth" });
  }
  return (
    <Scene id="orbit" labelledBy="orbit-title" stageClassName="film-scrim-left">
      <div className={cn(frame, "flex h-full flex-col justify-end pb-8 pt-24 lg:justify-center lg:pb-0")}>
        <div className={leftCol}>
          <Slate n="04" a={0.02} b={0.95} className="mb-5">
            Powered by ORBIT Engine™
          </Slate>
          <Words id="orbit-title" text={"Cinco etapas.\nSó fica o que funciona."} accent={["funciona."]} className="film-title text-[clamp(2rem,3.4vw,3.6rem)] text-fg" a={0.03} b={0.95} d={0.1} />
          <div className="mt-7" data-r="rise" data-a={0.08} data-b={0.95} data-d={0.1}>
            <div role="tablist" aria-label="Etapas do ORBIT" className="grid grid-cols-5 gap-1.5">
              {orbitDetail.map((o, k) => (
                <button
                  key={o.key}
                  role="tab"
                  type="button"
                  aria-selected={stage === k}
                  aria-label={`${o.key} — ${o.name}`}
                  data-cursor={o.name.split(" ")[0]}
                  onClick={() => jump(k)}
                  className={cn(
                    "group flex flex-col items-start gap-1.5 border-t pt-3 text-left transition-colors duration-300",
                    stage === k ? "border-fg" : k < stage ? "border-purple/70" : "border-white/15 hover:border-white/40",
                  )}
                >
                  <span className={cn("font-mono text-[13px]", stage === k ? "text-fg" : "text-subtle group-hover:text-muted")}>{o.key}</span>
                </button>
              ))}
            </div>
            <div className="mt-6 min-h-[11.5rem]" aria-live="polite">
              <div key={st.key} className="film-moment">
                <div className="flex items-baseline gap-4">
                  <span className="film-serif mk-ink-violet text-[clamp(3.6rem,6vw,5.6rem)] leading-[0.8]">{st.key}</span>
                  <div>
                    <p className="m-label">Etapa 0{stage + 1} / 05</p>
                    <p className="mt-1 text-[21px] font-medium tracking-[-0.02em] text-fg">{st.name}</p>
                  </div>
                </div>
                <p className="film-lead mt-3 max-w-[30rem] text-[15px] leading-relaxed text-muted">{st.summary}</p>
                <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
                  {st.techniques.map((t) => (
                    <li key={t} className="flex items-center gap-2 text-[13px] text-fg/85">
                      <span aria-hidden className="h-px w-3 bg-purple" />
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="m-label mt-2 text-[9.5px]">Visualização ilustrativa do método</p>
          </div>
        </div>
      </div>
    </Scene>
  );
}

/* 07 ─────────────────────────────── QUALITY GUARD */
const QUALITY = SCENE_INDEX.quality;
export function QualityScene() {
  const [step, setStep] = useState(0);
  const stepRef = useRef(0);
  useFilmFrame((s) => {
    const l = range(s, QUALITY, QUALITY + 1);
    const i = l < 0.42 ? 0 : l < 0.54 ? 1 : l < 0.66 ? 2 : 3;
    if (i !== stepRef.current) {
      stepRef.current = i;
      setStep(i);
    }
  });
  const rows = [
    { name: "Compressão de saída de ferramenta", verdict: "aprovada", ok: true, detail: "critérios de aceite mantidos" },
    { name: "Roteamento para modelo menor", verdict: "revertida", ok: false, detail: "qualidade abaixo do critério do projeto" },
  ];
  return (
    <Scene id="quality" labelledBy="quality-title" stageClassName="film-scrim-left">
      <div className={cn(frame, "flex h-full flex-col justify-end pb-10 pt-24 lg:justify-center lg:pb-0")}>
        <div className={leftCol}>
          <Slate n="05" a={0.04} b={0.93} className="mb-5">
            Quality Guard
          </Slate>
          <Words id="quality-title" text={"Economizar não vale\nse piorar a resposta."} accent={["resposta."]} className="film-title text-[clamp(2rem,3.8vw,4rem)] text-fg" a={0.05} b={0.93} d={0.11} />
          <div className="mt-7 w-full max-w-[32rem]" data-r="rise" data-a={0.3} data-b={0.93} data-d={0.1}>
            <div data-tilt="6" className="film-tilt rounded-[22px] border border-white/[0.08] bg-[rgba(10,8,34,.9)] p-4 shadow-[0_30px_90px_-40px_rgba(143,32,255,.6)] sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="flex items-center gap-2 text-[13px] text-fg">
                  <ShieldCheck className="size-4 shrink-0 text-success" aria-hidden /> Cada otimização passa por teste
                </p>
                <span className="m-label shrink-0 text-[9.5px]">ilustração</span>
              </div>
              <ul className="mt-4 space-y-2.5">
                {rows.map((r, k) => {
                  const shown = step >= k + 1;
                  return (
                    <li key={r.name} className="flex items-center justify-between gap-3 rounded-[14px] border border-white/[0.06] bg-white/[0.025] px-3.5 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] text-fg">{r.name}</p>
                        <p className={cn("text-[12px] transition-opacity duration-500", shown ? "text-muted opacity-100" : "opacity-0")}>{r.detail}</p>
                      </div>
                      <span
                        className={cn(
                          "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.1em] transition-[opacity,transform] duration-500",
                          shown ? "scale-100 opacity-100" : "scale-90 opacity-0",
                          r.ok ? "bg-success/10 text-success" : "bg-error/10 text-error",
                        )}
                      >
                        {r.ok ? <Check className="size-3" aria-hidden /> : <RotateCcw className="size-3" aria-hidden />}
                        {r.verdict}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className={cn("mt-4 text-[13px] leading-relaxed text-muted transition-opacity duration-500", step >= 3 ? "opacity-100" : "opacity-40")}>
                Fail-open: se o ORBIT falhar ou passar do orçamento de latência, a requisição original segue intacta.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Scene>
  );
}

/* 08 ─────────────────────────────── ASSISTANT */
export function AssistantScene() {
  return (
    <Scene id="assistant" labelledBy="assistant-title">
      <div className={cn(frame, "grid h-full content-center gap-8 pb-8 pt-24 lg:grid-cols-12 lg:items-center")}>
        <div className="lg:col-span-5">
          <Slate n="06" a={0.04} b={0.93} className="mb-5">
            Sempre por perto
          </Slate>
          <Words id="assistant-title" text={"Uma camada discreta.\nPresente quando precisa."} accent={["Presente", "quando", "precisa."]} className="film-title text-[clamp(2rem,3.8vw,4rem)] text-fg" a={0.05} b={0.93} d={0.1} />
          <p className="film-lead mt-6 max-w-[28rem] text-[15.5px] leading-relaxed text-muted" data-r="fade" data-a={0.16} data-b={0.93}>
            No Mac, a maindy. vive no notch ou na barra de menus. Um toque mostra o que o ORBIT está fazendo agora, sem abrir mais uma aba.
          </p>
          <p className="m-label mt-5 flex items-center gap-2 text-[10px]" data-r="fade" data-a={0.2} data-b={0.93}>
            <span aria-hidden className="size-1.5 rounded-full bg-warning" /> Demonstração interativa · dados simulados
          </p>
        </div>
        {/* a calm "desktop" so the widget reads as what it is: a floating launcher on your screen */}
        <div className="relative h-[46svh] lg:col-span-7 lg:h-[62svh]" data-r="scale" data-a={0.12} data-b={0.93} data-d={0.12}>
          <div aria-hidden className="absolute inset-0 overflow-hidden rounded-[24px] border border-white/[0.09] bg-[#0a0824] shadow-[0_60px_140px_-50px_rgba(143,32,255,.55)]">
            <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_85%_0%,rgba(143,32,255,.22),transparent_55%),radial-gradient(90%_70%_at_0%_100%,rgba(255,178,31,.08),transparent_60%)]" />
            <div className="relative flex h-7 items-center gap-3 border-b border-white/[0.06] bg-black/40 px-3">
              <span className="flex gap-1.5">
                <i className="size-2 rounded-full bg-white/20" />
                <i className="size-2 rounded-full bg-white/15" />
                <i className="size-2 rounded-full bg-white/10" />
              </span>
              <span className="font-mono text-[10px] text-subtle">agente-faturas — terminal</span>
            </div>
            {/* a quiet terminal: the work keeps happening, maindy. floats above it */}
            <div className="relative space-y-2 p-5 font-mono text-[11.5px] leading-relaxed text-white/35">
              <p><span className="text-purple/80">❯</span> pnpm agent:run --project faturas</p>
              <p>→ base_url http://127.0.0.1:8787/v1</p>
              <p>· 112 chamadas · 18 servidas do cache</p>
              <p>· tool_output comprimido (2.104 → 241 linhas)</p>
              <p>· chamada idêntica bloqueada pelo loop guard</p>
              <p className="text-white/20">· aguardando próxima tarefa_</p>
            </div>
            <p className="m-label absolute bottom-4 left-5 text-[10px]">Toque no orbe · arraste · Esc fecha</p>
          </div>
          <MaindyOrbAssistant className="absolute inset-0 top-7" />
        </div>
      </div>
    </Scene>
  );
}

/* 09 ─────────────────────────────── CLARITY (centred beat) */
export function ClarityScene() {
  return (
    <Scene id="clarity" labelledBy="clarity-title">
      <div className={cn(frame, "flex h-full flex-col items-center justify-between pb-[8svh] pt-[22svh] text-center")}>
        <Words
          id="clarity-title"
          text={"Menos desperdício.\nMais espaço para construir."}
          accent={["construir."]}
          className="film-display text-[clamp(2.4rem,5.6vw,6rem)] text-fg"
          a={0.06}
          b={0.5}
          d={0.13}
        />
        <div className="w-full" data-r="rise" data-a={0.42} data-b={0.93} data-d={0.12}>
          <p className="film-title mx-auto max-w-[22ch] text-[clamp(1.6rem,2.6vw,2.6rem)] text-fg">Cada número diz de onde veio.</p>
          <ul className="mx-auto mt-7 grid max-w-[64rem] gap-x-8 gap-y-4 text-left sm:grid-cols-2 lg:grid-cols-4">
            {provenance.map((p) => (
              <li key={p.key} className="border-t border-white/12 pt-3">
                <p className="flex items-center gap-2 text-[13.5px] text-fg">
                  <span
                    aria-hidden
                    className={cn(
                      "size-1.5 rounded-full",
                      p.key === "provider_reported" ? "bg-purple" : p.key === "locally_measured" ? "bg-success" : p.key === "experimentally_estimated" ? "bg-warning" : "border border-subtle",
                    )}
                  />
                  {p.label}
                </p>
                <p className="mt-1.5 text-[12.5px] leading-snug text-muted max-sm:hidden">{p.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Scene>
  );
}

/* 10 ─────────────────────────────── PRODUCT */
export function ProductScene() {
  return (
    <Scene id="product" labelledBy="product-title">
      <div className={cn(frame, "flex h-full flex-col pb-6 pt-20 sm:pt-24")}>
        <div className="mb-3 text-center">
          <Slate n="07" a={0.02} b={0.95} className="mb-3 justify-center">
            O app
          </Slate>
          <Words id="product-title" text="Saiba o que a sua IA custa." accent={["custa."]} className="film-title mx-auto text-[clamp(1.9rem,3.2vw,3.2rem)] text-fg" a={0.02} b={0.95} d={0.1} />
        </div>
        <div className="min-h-0 flex-1" data-r="fade" data-a={0.04} data-b={0.95} data-d={0.08}>
          <ProductDevice />
        </div>
      </div>
    </Scene>
  );
}

/* 11 ─────────────────────────────── FINAL / DOWNLOAD */
export function FinalScene() {
  return (
    <Scene id="final" labelledBy="final-title">
      <div className="absolute inset-0" data-film-only>
        <FinalPlate />
        <div aria-hidden className="film-dim pointer-events-none absolute inset-0 bg-black/0 transition-colors duration-700" />
      </div>
      <div className={cn(frame, "relative flex h-full flex-col items-center justify-end pb-[6svh] text-center")}>
        <div data-flow-only className="mb-10">
          <Image src="/brand/wordmark-white.png" alt="" width={888} height={256} className="mx-auto h-auto w-[min(70vw,380px)]" />
        </div>
        <Words
          id="final-title"
          text={"Sua IA trabalha mais.\nVocê gasta menos."}
          accent={["menos."]}
          className="film-display text-[clamp(2.2rem,4.6vw,4.8rem)] text-fg"
          a={0.56}
          d={0.1}
        />
        <p className="film-lead mx-auto mt-4 max-w-[32rem] text-[15.5px] leading-relaxed text-muted" data-r="fade" data-a={0.62} data-d={0.08}>
          Comece medindo. Otimize só o que provar resultado.
        </p>
        <div className="mt-7 w-full" data-r="rise" data-a={0.66} data-d={0.1}>
          <DownloadExperience
            onReplay={() => {
              track("replay");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        </div>
      </div>
    </Scene>
  );
}
