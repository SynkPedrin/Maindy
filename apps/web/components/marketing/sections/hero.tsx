import Link from "next/link";
import { HeroOrb } from "../hero-orb";
import { HeroScrollLayer, Magnetic } from "../motion";
import { ButtonLink, Container, OrbitArcs } from "../ui";

const specs = [
  { value: "30–60%", caption: "Meta de redução de gasto em cargas qualificadas", note: "meta, não resultado garantido" },
  { value: "05", caption: "Etapas do método ORBIT, do baseline ao teste", note: "observar antes de otimizar" },
  { value: "Local", caption: "Seus prompts ficam na sua máquina por padrão", note: "só metadados vão à nuvem" },
  { value: "Fail-open", caption: "Se o ORBIT falhar, a requisição original segue", note: "sem ponto único de falha" },
];

export function Hero() {
  return (
    <section id="produto" aria-labelledby="hero-title" className="mk-grain relative isolate overflow-hidden pt-28 sm:pt-32 lg:pt-32">
      {/* Atmosphere */}
      <div aria-hidden className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(70%_60%_at_70%_40%,rgba(143,32,255,.20),transparent_70%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(40%_40%_at_100%_0%,rgba(255,178,31,.10),transparent_70%)]" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-bg" />
        <div className="mk-sweep absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-purple/[0.10] to-transparent" />
        <OrbitArcs className="inset-x-0 top-0 h-[100svh] w-full opacity-80 [mask-image:linear-gradient(to_bottom,black_60%,transparent)]" />
      </div>

      <Container>
        <HeroScrollLayer depth={1.5}>
        <p className="m-label mk-fade flex items-center gap-3" style={{ ["--d" as string]: "60ms" }}>
          <span aria-hidden className="relative flex size-2">
            <span className="absolute inset-0 animate-ping rounded-full bg-purple/60 motion-reduce:hidden" />
            <span className="relative size-2 rounded-full bg-purple" />
          </span>
          Powered by ORBIT Engine™
        </p>
        {/* One text block, painted immediately: the headline is the LCP element. */}
        <h1 id="hero-title" className="mk-display relative z-10 mt-6 text-[clamp(2.75rem,7.6vw,8.25rem)] text-fg lg:whitespace-nowrap">
          Sua IA trabalha mais.
          <br />
          <span className="mk-ink-violet mk-sheen">Você gasta menos.</span>
        </h1>
        </HeroScrollLayer>

        <div className="grid items-start gap-y-6 lg:grid-cols-12 lg:gap-x-8">
          <HeroScrollLayer depth={1.2} className="pt-8 lg:col-span-5 lg:pt-12">
            <p className="mk-fade mk-lead max-w-[30rem] text-[17px] leading-relaxed text-muted sm:text-[19px]" style={{ ["--d" as string]: "120ms" }}>
              Uma camada inteligente para reduzir desperdícios de IA em APIs, agentes e ferramentas de desenvolvimento.
            </p>
            <div className="mk-fade mt-9 flex flex-wrap items-center gap-3" style={{ ["--d" as string]: "220ms" }}>
              <Magnetic>
                <ButtonLink href="/cadastro">Começar agora</ButtonLink>
              </Magnetic>
              <ButtonLink href="/metodologia" variant="secondary" arrow={false}>
                Conhecer a metodologia
              </ButtonLink>
            </div>
            <p className="mk-fade m-label mt-12 hidden items-center gap-3 lg:flex" style={{ ["--d" as string]: "320ms" }}>
              <span aria-hidden className="h-px w-8 bg-line-strong" />
              Arraste o anel · O R B I T
            </p>
          </HeroScrollLayer>
          <HeroScrollLayer depth={0.5} className="mk-intro-orb lg:col-span-6 lg:col-start-7 lg:mt-4 xl:mt-0">
            <HeroOrb />
          </HeroScrollLayer>
        </div>
      </Container>

      {/* Spec strip — large readouts, tiny captions */}
      <Container className="mt-12 lg:mt-16">
        <dl className="grid grid-cols-2 border-t border-line lg:grid-cols-4">
          {specs.map((s, i) => (
            <div
              key={s.value}
              className={`mk-fade border-line py-7 pr-4 sm:py-9 ${i % 2 === 1 ? "pl-5 sm:pl-8" : ""} ${i % 2 === 0 ? "border-r" : ""} ${i < 2 ? "border-b lg:border-b-0" : ""} lg:border-r lg:pl-8 lg:first:pl-0 lg:last:border-r-0`}
              style={{ ["--d" as string]: `${450 + i * 70}ms` }}
            >
              <dt className="sr-only">{s.caption}</dt>
              <dd>
                <span className="mk-num block text-[clamp(2rem,4vw,3.25rem)] text-fg">{s.value}</span>
                <span className="mt-3 block max-w-[15rem] text-[13.5px] leading-snug text-muted">{s.caption}</span>
                <span className="m-label mt-2 block text-[10px]">{s.note}</span>
              </dd>
            </div>
          ))}
        </dl>
        <p className="pb-4 text-[12.5px] text-subtle">
          30–60% é a meta comercial para cargas qualificadas, apurada contra baseline real.{" "}
          <Link href="/#garantia" className="underline decoration-line-strong underline-offset-4 hover:text-muted">
            Ver condições
          </Link>
          .
        </p>
      </Container>
    </section>
  );
}
