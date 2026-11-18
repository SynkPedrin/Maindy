"use client";
import Link from "next/link";
import { useState } from "react";
import * as DM from "@radix-ui/react-dropdown-menu";
import { ChevronDown, CreditCard, LogOut, Settings, Building2 } from "lucide-react";
import { useMe } from "@/lib/api/hooks";
import { apiVoid } from "@/lib/api/client";

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

export async function logout() {
  try {
    await apiVoid("/v1/auth/logout", { method: "POST", body: {} });
  } catch {
    /* even if the API is unreachable, leave the app; the cookie expires server-side */
  }
  window.location.assign("/login?motivo=saiu");
}

export function UserMenu() {
  const { data: me } = useMe();
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  const itemCls =
    "flex h-9 cursor-pointer select-none items-center gap-2.5 rounded-[8px] px-2.5 text-[13px] text-muted outline-none data-[highlighted]:bg-surface-3 data-[highlighted]:text-fg";
  return (
    <DM.Root>
      <DM.Trigger
        className="flex h-9 items-center gap-2 rounded-[12px] border border-line bg-surface-1 pl-1 pr-2 text-left transition-colors hover:border-line-strong data-[state=open]:border-line-strong"
        aria-label={`Menu da conta de ${me.user.name}`}
        data-testid="user-menu"
      >
        <span className="grid size-7 place-items-center rounded-[9px] bg-[linear-gradient(135deg,var(--m-violet),var(--m-purple))] text-[11px] font-semibold text-white">
          {initials(me.user.name)}
        </span>
        <span className="hidden max-w-[140px] truncate text-[13px] font-medium text-fg sm:block">{me.user.name.split(" ")[0]}</span>
        <ChevronDown className="size-3.5 text-subtle" aria-hidden />
      </DM.Trigger>
      <DM.Portal>
        <DM.Content align="end" sideOffset={8} className="z-50 w-64 rounded-[14px] border border-line-strong bg-surface-2 p-1.5 shadow-2xl">
          <div className="px-2.5 pb-2 pt-1.5">
            <p className="truncate text-sm font-medium text-fg">{me.user.name}</p>
            <p className="truncate text-xs text-subtle">{me.user.email}</p>
          </div>
          <div className="mx-1 mb-1 flex items-center gap-2 rounded-[10px] bg-surface-1 px-2.5 py-2 text-xs text-muted">
            <Building2 className="size-3.5 text-subtle" aria-hidden />
            <span className="truncate">{me.organization.name}</span>
            <span className="ml-auto text-[10.5px] uppercase tracking-wider text-subtle">{me.role}</span>
          </div>
          <DM.Separator className="my-1 h-px bg-line" />
          <DM.Item asChild className={itemCls}>
            <Link href="/app/configuracoes">
              <Settings className="size-4" aria-hidden /> Configurações
            </Link>
          </DM.Item>
          <DM.Item asChild className={itemCls}>
            <Link href="/app/faturamento">
              <CreditCard className="size-4" aria-hidden /> Faturamento
            </Link>
          </DM.Item>
          <DM.Separator className="my-1 h-px bg-line" />
          <DM.Item
            className={itemCls}
            disabled={busy}
            onSelect={(e) => {
              e.preventDefault();
              setBusy(true);
              void logout();
            }}
          >
            <LogOut className="size-4" aria-hidden /> {busy ? "Saindo…" : "Sair"}
          </DM.Item>
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}
