"use client";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import type { MeDto } from "@maindy/contracts";
import { ApiClientError } from "@/lib/api/client";
import { qk } from "@/lib/api/hooks";
import { ToastProvider } from "@/components/ui/toast";
import { ThemeProvider } from "./theme";

function onUnauthorized(err: unknown) {
  if (err instanceof ApiClientError && err.status === 401 && err.code === "unauthorized" && typeof window !== "undefined") {
    const next = window.location.pathname + window.location.search;
    window.location.assign(`/login?motivo=sessao&next=${encodeURIComponent(next)}`);
  }
}

export function AppProviders({ me, children }: { me: MeDto; children: ReactNode }) {
  const [client] = useState(() => {
    const qc = new QueryClient({
      queryCache: new QueryCache({ onError: onUnauthorized }),
      mutationCache: new MutationCache({ onError: onUnauthorized }),
      defaultOptions: {
        queries: {
          staleTime: 30_000,
          refetchOnWindowFocus: false,
          retry: (count, err) => !(err instanceof ApiClientError && err.status >= 400 && err.status < 500) && count < 2,
        },
      },
    });
    qc.setQueryData(qk.me, me);
    qc.setQueryData(qk.onboarding, me.onboarding);
    return qc;
  });
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <ToastProvider>{children}</ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
