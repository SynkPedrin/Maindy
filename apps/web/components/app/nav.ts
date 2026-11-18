import {
  Bot,
  CreditCard,
  Download,
  FileText,
  Gauge,
  LayoutDashboard,
  ListChecks,
  Orbit,
  PiggyBank,
  Plug,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** shows the period selector in the header */
  periodAware?: boolean;
  description?: string;
}

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Painel",
    items: [
      { href: "/app/overview", label: "Overview", icon: LayoutDashboard, periodAware: true },
      { href: "/app/economia", label: "Economia", icon: PiggyBank, periodAware: true },
      { href: "/app/conexoes", label: "Integrações", icon: Plug },
      { href: "/app/agentes", label: "Agentes & Projetos", icon: Bot },
      { href: "/app/limites", label: "Limites & Sessões", icon: Gauge },
    ],
  },
  {
    label: "Motor",
    items: [
      { href: "/app/orbit", label: "ORBIT Engine", icon: Orbit },
      { href: "/app/qualidade", label: "Qualidade", icon: ShieldCheck, periodAware: true },
      { href: "/app/relatorios", label: "Relatórios", icon: FileText, periodAware: true },
    ],
  },
  {
    label: "Conta",
    items: [
      { href: "/app/faturamento", label: "Faturamento", icon: CreditCard },
      { href: "/app/configuracoes", label: "Configurações", icon: Settings },
    ],
  },
];

export const START_ITEMS: NavItem[] = [
  { href: "/app/onboarding", label: "Onboarding", icon: ListChecks },
  { href: "/app/download", label: "Download", icon: Download },
];

const ALL = [...NAV_GROUPS.flatMap((g) => g.items), ...START_ITEMS];

export function findNav(pathname: string): NavItem | undefined {
  return ALL.find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
}

export const EXTRA_TITLES: Record<string, string> = {
  "/app/dispositivos/parear": "Parear dispositivo",
  "/app/faturamento/sandbox": "Checkout de testes",
};
