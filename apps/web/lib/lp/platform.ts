import type { ReleaseDto, ReleaseTarget } from "@maindy/contracts";

export type Platform = "mac" | "windows" | "ios" | "android" | "linux" | "other";
type UADataLike = { platform?: string; mobile?: boolean; getHighEntropyValues?: (h: string[]) => Promise<{ architecture?: string }> };

/** Best-effort, non-authoritative guess. Browsers do not always reveal Apple Silicon vs Intel — we say so. */
export async function detectPlatform(): Promise<{ platform: Platform; target: ReleaseTarget | null; confident: boolean }> {
  const nav = navigator as Navigator & { userAgentData?: UADataLike };
  const ua = navigator.userAgent;
  const p = nav.userAgentData?.platform ?? navigator.platform ?? "";
  // iPadOS reports "MacIntel" with touch points
  if (/iPhone|iPad|iPod/.test(ua) || (/Mac/.test(p) && navigator.maxTouchPoints > 1)) return { platform: "ios", target: null, confident: true };
  if (/Android/i.test(ua)) return { platform: "android", target: null, confident: true };
  let arch: string | undefined;
  try {
    arch = (await nav.userAgentData?.getHighEntropyValues?.(["architecture"]))?.architecture;
  } catch {}
  if (/mac/i.test(p) || /Macintosh|Mac OS X/.test(ua)) {
    if (arch === "x86") return { platform: "mac", target: "macos-x64", confident: true };
    return { platform: "mac", target: "macos-arm64", confident: arch === "arm" };
  }
  if (/win/i.test(p) || /Windows/.test(ua)) {
    const armWin = arch === "arm" || /ARM64|aarch64/i.test(ua);
    return { platform: "windows", target: armWin ? "windows-arm64" : "windows-x64", confident: !!arch };
  }
  if (/linux/i.test(p) || /Linux/.test(ua)) return { platform: "linux", target: null, confident: true };
  return { platform: "other", target: null, confident: false };
}

export const TARGET_LABEL: Record<ReleaseTarget, string> = {
  "macos-arm64": "Mac com Apple Silicon (M1 ou posterior)",
  "macos-x64": "Mac com Intel",
  "windows-x64": "Windows (x64)",
  "windows-arm64": "Windows (ARM64)",
};

export function signingNote(r: ReleaseDto): { tone: "ok" | "warn"; text: string } {
  switch (r.signing) {
    case "notarized":
      return { tone: "ok", text: "Assinado e notarizado pela Apple: abre normalmente." };
    case "authenticode":
      return { tone: "ok", text: "Instalador assinado (Authenticode)." };
    case "developer_id":
      return { tone: "warn", text: "Assinado com Developer ID, ainda não notarizado: o macOS pode pedir confirmação na primeira abertura." };
    case "adhoc":
      return {
        tone: "warn",
        text: "Versão inicial com assinatura ad-hoc (sem Developer ID). Na primeira abertura, libere em Ajustes do Sistema → Privacidade e Segurança → “Abrir Mesmo Assim”.",
      };
    default:
      return { tone: "warn", text: "Instalador sem assinatura: o sistema exibirá um aviso na primeira abertura." };
  }
}
