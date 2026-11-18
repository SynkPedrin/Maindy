import { cn } from "@/lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-[10px] bg-surface-3/70", className)} />;
}

export function SkeletonCard({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("rounded-[18px] border border-line bg-surface-1 p-5", className)} role="status" aria-label="Carregando">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-4 h-7 w-36" />
      {Array.from({ length: Math.max(0, lines - 2) }).map((_, i) => (
        <Skeleton key={i} className="mt-3 h-3 w-full" />
      ))}
    </div>
  );
}
