"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as Tooltip from "@radix-ui/react-tooltip";
import { Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { OnboardingStep } from "@maindy/contracts";
import { Orb, Wordmark } from "@/components/brand";
import { cn } from "@/lib/cn";
import { useMe } from "@/lib/api/hooks";
import { periodQuery } from "@/lib/api/period";
import { EXTRA_TITLES, NAV_GROUPS, START_ITEMS, findNav, type NavItem } from "./nav";
import { PeriodSelector } from "./period-selector";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

const COLLAPSE_KEY = "maindy-sidebar-collapsed";
const TOTAL_STEPS = OnboardingStep.options.length;

function NavLink({ item, collapsed, onNavigate, badge }: { item: NavItem; collapsed: boolean; onNavigate?: () => void; badge?: ReactNode }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;
  const link = (
    <Link
      href={`${item.href}${periodQuery(sp)}`}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex h-9 items-center gap-3 rounded-[10px] px-2.5 text-[13.5px] transition-colors duration-150",
        active ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface-1 hover:text-fg",
        collapsed && "justify-center px-0",
      )}
    >
      {active ? <span aria-hidden className="absolute -left-3 top-2 h-5 w-[2px] rounded-full bg-neon shadow-[0_0_12px_rgba(164,36,255,.8)]" /> : null}
      <Icon className={cn("size-[18px] shrink-0", active ? "text-[color-mix(in_oklab,var(--m-purple)_70%,white)]" : "text-subtle group-hover:text-muted")} aria-hidden />
      {!collapsed ? <span className="min-w-0 flex-1 truncate">{item.label}</span> : <span className="sr-only">{item.label}</span>}
      {!collapsed && badge ? badge : null}
    </Link>
  );
  if (!collapsed) return link;
  return (
    <Tooltip.Root delayDuration={150}>
      <Tooltip.Trigger asChild>{link}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content side="right" sideOffset={10} className="z-50 rounded-[8px] border border-line-strong bg-surface-2 px-2.5 py-1.5 text-xs text-fg shadow-xl">
          {item.label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function SidebarContent({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { data: me } = useMe();
  const done = me?.onboarding.completed.length ?? 0;
  const onboardingOpen = me ? done < TOTAL_STEPS && !me.onboarding.dismissed : false;
  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-16 shrink-0 items-center", collapsed ? "justify-center" : "px-5")}>
        <Link href="/app/overview" onClick={onNavigate} aria-label="maindy. — Overview">
          {collapsed ? <Orb size={34} /> : <Wordmark height={22} />}
        </Link>
      </div>
      <nav aria-label="Navegação principal" className="m-scroll-thin flex-1 overflow-y-auto px-3 pb-4">
        <div className="mb-4 flex flex-col gap-0.5">
          {START_ITEMS.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              collapsed={collapsed}
              onNavigate={onNavigate}
              badge={
                item.href === "/app/onboarding" && onboardingOpen ? (
                  <span className="m-num rounded-full bg-[color-mix(in_oklab,var(--m-gold)_16%,transparent)] px-1.5 py-0.5 text-[10.5px] font-semibold text-gold">
                    {done}/{TOTAL_STEPS}
                  </span>
                ) : null
              }
            />
          ))}
        </div>
        {NAV_GROUPS.map((g) => (
          <div key={g.label} className="mb-4">
            {!collapsed ? <div className="m-label mb-1.5 px-2.5 !text-[10px]">{g.label}</div> : <div className="mx-auto mb-2 h-px w-6 bg-line" />}
            <div className="flex flex-col gap-0.5">
              {g.items.map((item) => (
                <NavLink key={item.href} item={item} collapsed={collapsed} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        ))}
      </nav>
      {me && !collapsed ? (
        <div className="mx-3 mb-3 rounded-[14px] border border-line bg-surface-1/70 p-3">
          <div className="m-label !text-[10px]">Organização</div>
          <div className="mt-1 truncate text-[13px] font-medium text-fg">{me.organization.name}</div>
          <div className="mt-0.5 text-[12px] text-subtle">
            {me.subscription ? `Plano ${planName(me.subscription.planCode)} · ${statusName(me.subscription.status)}` : "Sem plano ativo"}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function planName(code: string) {
  return code === "starter" ? "Starter" : code === "pro" ? "Pro" : code === "master_economy" ? "Master Economy" : code;
}
export function statusName(s: string) {
  return (
    { none: "sem assinatura", trialing: "em teste", active: "ativo", past_due: "pagamento pendente", canceled: "cancelado", incomplete: "incompleto" } as Record<string, string>
  )[s] ?? s;
}

function HeaderTitle() {
  const pathname = usePathname();
  const item = findNav(pathname);
  const title = EXTRA_TITLES[pathname] ?? item?.label ?? "Painel";
  return <h1 className="truncate text-[15px] font-semibold tracking-[-0.01em] text-fg">{title}</h1>;
}

function HeaderPeriod() {
  const pathname = usePathname();
  const item = findNav(pathname);
  if (!item?.periodAware) return null;
  return <PeriodSelector />;
}

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {}
  }, []);
  useEffect(() => setDrawer(false), [pathname]);

  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {}
      return !c;
    });
  };

  return (
    <Tooltip.Provider>
      <div className="relative min-h-dvh bg-bg-deep lg:p-3">
        <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-md focus:bg-surface-2 focus:px-3 focus:py-2">
          Pular para o conteúdo
        </a>
        <div className="flex min-h-dvh lg:min-h-[calc(100dvh-24px)] lg:overflow-clip lg:rounded-[22px] lg:border lg:border-line lg:shadow-[0_40px_120px_-40px_rgba(0,0,0,.6)]">
          {/* Desktop sidebar */}
          <aside
            className={cn(
              "m-scope-dark hidden shrink-0 border-r border-line bg-[#06051a] transition-[width] duration-200 ease-out-expo lg:block",
              collapsed ? "w-[72px]" : "w-[248px]",
            )}
          >
            <div className="sticky top-3 h-[calc(100dvh-24px)]">
              <Suspense>
                <SidebarContent collapsed={collapsed} />
              </Suspense>
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col bg-bg">
            <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-line bg-[color-mix(in_oklab,var(--m-bg)_82%,transparent)] px-4 backdrop-blur-xl sm:px-6">
              <DialogPrimitive.Root open={drawer} onOpenChange={setDrawer}>
                <DialogPrimitive.Trigger className="grid size-9 place-items-center rounded-[10px] text-muted hover:bg-surface-2 hover:text-fg lg:hidden" aria-label="Abrir menu">
                  <Menu className="size-5" />
                </DialogPrimitive.Trigger>
                <DialogPrimitive.Portal>
                  <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] lg:hidden" />
                  <DialogPrimitive.Content className="m-scope-dark fixed inset-y-0 left-0 z-50 w-[min(300px,86vw)] border-r border-line bg-[#06051a] shadow-2xl outline-none lg:hidden">
                    <DialogPrimitive.Title className="sr-only">Menu</DialogPrimitive.Title>
                    <DialogPrimitive.Description className="sr-only">Navegação do painel</DialogPrimitive.Description>
                    <DialogPrimitive.Close className="absolute right-3 top-4 z-10 grid size-8 place-items-center rounded-full text-subtle hover:bg-surface-2 hover:text-fg" aria-label="Fechar menu">
                      <X className="size-4" />
                    </DialogPrimitive.Close>
                    <Suspense>
                      <SidebarContent collapsed={false} onNavigate={() => setDrawer(false)} />
                    </Suspense>
                  </DialogPrimitive.Content>
                </DialogPrimitive.Portal>
              </DialogPrimitive.Root>
              <button
                type="button"
                onClick={toggle}
                className="hidden size-9 place-items-center rounded-[10px] text-subtle hover:bg-surface-2 hover:text-fg lg:grid"
                aria-label={collapsed ? "Expandir barra lateral" : "Recolher barra lateral"}
                aria-pressed={collapsed}
              >
                {collapsed ? <PanelLeftOpen className="size-[18px]" /> : <PanelLeftClose className="size-[18px]" />}
              </button>
              <div className="min-w-0 flex-1">
                <HeaderTitle />
              </div>
              <Suspense>
                <div className="hidden md:block">
                  <HeaderPeriod />
                </div>
              </Suspense>
              <ThemeToggle />
              <UserMenu />
            </header>
            <Suspense>
              <div className="border-b border-line px-4 py-2.5 md:hidden empty:hidden">
                <HeaderPeriod />
              </div>
            </Suspense>
            <main id="conteudo" className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
              <div className="mx-auto w-full max-w-[1240px]">{children}</div>
            </main>
          </div>
        </div>
      </div>
    </Tooltip.Provider>
  );
}
