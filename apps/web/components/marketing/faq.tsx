"use client";

import * as Accordion from "@radix-ui/react-accordion";
import { Plus } from "lucide-react";

export function Faq({ items }: { items: readonly { q: string; a: string }[] }) {
  return (
    <Accordion.Root type="single" collapsible className="border-t border-line">
      {items.map((it, i) => (
        <Accordion.Item key={it.q} value={`q${i}`} className="border-b border-line">
          <Accordion.Header>
            <Accordion.Trigger className="group flex w-full items-center justify-between gap-6 py-6 text-left text-[17px] font-medium tracking-[-0.015em] text-fg transition-colors hover:text-white sm:text-[19px]">
              <span className="flex items-baseline gap-5">
                <span className="hidden font-mono text-[11px] tracking-[0.14em] text-subtle sm:inline">{String(i + 1).padStart(2, "0")}</span>
                {it.q}
              </span>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-line-strong transition-[transform,background-color] duration-300 ease-out-expo group-hover:bg-white/[0.04] group-data-[state=open]:rotate-45 group-data-[state=open]:bg-fg group-data-[state=open]:text-bg">
                <Plus aria-hidden className="size-4" />
              </span>
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content className="mk-acc-content">
            <p className="max-w-3xl pb-7 text-[15.5px] leading-relaxed text-muted sm:pl-[52px]">{it.a}</p>
          </Accordion.Content>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
}
