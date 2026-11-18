"use client";
import { ErrorState } from "@/components/ui/empty-state";

export default function AppError({ error, reset }: { error: Error; reset: () => void }) {
  return <ErrorState message={error.message || "Erro inesperado nesta tela."} onRetry={reset} />;
}
