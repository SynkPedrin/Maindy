"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "dark" | "light";
const KEY = "maindy-theme";

/* The pre-paint restore lives in app/layout.tsx <head> (guarded to /app paths). */

const Ctx = createContext<{ theme: Theme; setTheme: (t: Theme) => void } | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(KEY);
    } catch {}
    const t: Theme = stored === "light" ? "light" : "dark";
    setThemeState(t);
    document.documentElement.setAttribute("data-theme", t);
    // Leaving the dashboard (e.g. to the landing page) restores the default dark theme.
    return () => document.documentElement.setAttribute("data-theme", "dark");
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    document.documentElement.setAttribute("data-theme", t);
    try {
      localStorage.setItem(KEY, t);
    } catch {}
  }, []);

  return <Ctx.Provider value={{ theme, setTheme }}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTheme fora do ThemeProvider");
  return c;
}
