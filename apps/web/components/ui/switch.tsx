"use client";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/cn";

export function Switch({ className, ...props }: SwitchPrimitive.SwitchProps) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full border border-line-strong bg-surface-3 transition-colors duration-150 data-[state=checked]:border-transparent data-[state=checked]:bg-violet disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-[18px] translate-x-[2px] rounded-full bg-white shadow-sm transition-transform duration-150 ease-out-expo data-[state=checked]:translate-x-[18px]" />
    </SwitchPrimitive.Root>
  );
}
