import Image from "next/image";
import { cn } from "@/lib/cn";

/** Original white wordmark `maindy.` (gold i-dot, violet period). Never redraw it. Aspect 888:256. */
export function Wordmark({ className, height = 28, priority = false }: { className?: string; height?: number; priority?: boolean }) {
  const width = Math.round((height * 888) / 256);
  return (
    <Image src="/brand/wordmark-white-640.webp" alt="maindy." width={width} height={height} priority={priority} className={cn("select-none", className)} draggable={false} />
  );
}

/** Original orb icon `m.` with its glow (transparent background). */
export function Orb({ size = 40, className, priority = false, alt = "" }: { size?: number; className?: string; priority?: boolean; alt?: string }) {
  const src = size <= 48 ? "/brand/orb-96.webp" : size <= 80 ? "/brand/orb-160.webp" : size <= 160 ? "/brand/orb-320.webp" : "/brand/orb-640.webp";
  return <Image src={src} alt={alt} width={size} height={size} priority={priority} className={cn("select-none", className)} draggable={false} />;
}
