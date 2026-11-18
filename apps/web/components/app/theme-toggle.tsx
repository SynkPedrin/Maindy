"use client";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "./theme";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className="grid size-9 place-items-center rounded-[10px] text-subtle transition-colors hover:bg-surface-2 hover:text-fg"
      aria-label={theme === "dark" ? "Usar tema claro" : "Usar tema escuro"}
      title={theme === "dark" ? "Tema claro" : "Tema escuro"}
    >
      {theme === "dark" ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
    </button>
  );
}
