import { CanvasTexture, LinearMipmapLinearFilter, LinearFilter, SRGBColorSpace } from "three";

/**
 * "Thoughts" of an overloaded AI bill — illustrative examples of waste (not measurements).
 * kind: waste (coral dot) · money (amber) · blind (muted)
 */
export const FRAGMENTS: { t: string; s: string; kind: "waste" | "money" | "blind" }[] = [
  { t: "Contexto repetido", s: "18.402 tokens · 6ª vez", kind: "waste" },
  { t: "Mesmo arquivo, de novo", s: "auth.ts · lido 3×", kind: "waste" },
  { t: "Retry #4", s: "mesma chamada, mesmo erro", kind: "waste" },
  { t: "tool_output: 41 KB", s: "2.104 linhas de log", kind: "waste" },
  { t: "System prompt reenviado", s: "3.950 tokens por chamada", kind: "waste" },
  { t: "Agente em loop", s: "12 iterações idênticas", kind: "waste" },
  { t: "US$ 0,42", s: "US$ 0,42 · US$ 0,42 · US$ 0,42", kind: "money" },
  { t: "Stack trace duplicado", s: "× 38", kind: "waste" },
  { t: "package-lock.json inteiro", s: "para mudar uma linha", kind: "waste" },
  { t: "Mesma pergunta", s: "nova cobrança", kind: "money" },
  { t: "Qual chamada custou isso?", s: "sem visibilidade", kind: "blind" },
  { t: "Histórico completo", s: "a cada mensagem", kind: "waste" },
  { t: "Modelo grande", s: "para uma tarefa simples", kind: "money" },
  { t: "Barra de progresso do npm", s: "\\r repetido 900 vezes", kind: "waste" },
  { t: "Cache ignorado", s: "o prefixo mudou 1 caractere", kind: "waste" },
  { t: "Resposta verbosa", s: "1.800 tokens de saída", kind: "money" },
  { t: "Diff de 3 linhas", s: "arquivo de 900 enviado", kind: "waste" },
  { t: "Chamada idêntica", s: "há 40 segundos", kind: "waste" },
  { t: "Log de build", s: "ANSI · spinners · ruído", kind: "waste" },
  { t: "Fatura do mês", s: "maior que o previsto", kind: "money" },
  { t: "Tokens", s: "que ninguém leu", kind: "blind" },
  { t: "README colado", s: "pela quarta vez", kind: "waste" },
  { t: "Embeddings recalculados", s: "mesmo texto", kind: "waste" },
  { t: "Quanto economizamos?", s: "ninguém sabe dizer", kind: "blind" },
];

export const CELL_W = 1000;
export const CELL_H = 190;
export const COLS = 2;
export const ROWS = Math.ceil(FRAGMENTS.length / COLS);

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Draws every fragment card into one atlas (one texture, one draw call). Widths are measured per card. */
export function buildFragmentAtlas(scale = 1): { texture: CanvasTexture; rects: [number, number, number, number][]; aspects: number[] } {
  const W = CELL_W * COLS;
  const H = CELL_H * ROWS;
  const c = document.createElement("canvas");
  // drawn at `scale` (1.6 on high: crisp cards when they pass close to the camera on 4K screens)
  c.width = Math.round(W * scale);
  c.height = Math.round(H * scale);
  const g = c.getContext("2d")!;
  g.scale(scale, scale);
  const cs = getComputedStyle(document.body);
  const sans = cs.fontFamily || "system-ui, sans-serif";
  const mono = getComputedStyle(document.documentElement).getPropertyValue("--font-geist-mono").trim() || "ui-monospace, monospace";
  const rects: [number, number, number, number][] = [];
  const aspects: number[] = [];
  FRAGMENTS.forEach((f, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x0 = col * CELL_W;
    const y0 = row * CELL_H;
    g.font = `500 54px ${sans}`;
    const tw = g.measureText(f.t).width;
    g.font = `400 30px ${mono}`;
    const sw = g.measureText(f.s).width;
    const w = Math.min(CELL_W - 20, Math.max(tw, sw) + 120);
    const h = CELL_H - 20;
    const x = x0 + 10;
    const y = y0 + 10;
    // glass card
    roundRect(g, x, y, w, h, 34);
    const grad = g.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, "rgba(34, 24, 82, 0.92)");
    grad.addColorStop(1, "rgba(12, 9, 40, 0.92)");
    g.fillStyle = grad;
    g.fill();
    g.lineWidth = 2.5;
    g.strokeStyle = f.kind === "money" ? "rgba(255, 196, 64, 0.45)" : "rgba(196, 150, 255, 0.38)";
    g.stroke();
    // status dot
    g.beginPath();
    g.arc(x + 48, y + 62, 9, 0, Math.PI * 2);
    g.fillStyle = f.kind === "money" ? "#FFC23D" : f.kind === "blind" ? "#8E87B0" : "#FF7A7A";
    g.shadowColor = g.fillStyle;
    g.shadowBlur = 18;
    g.fill();
    g.shadowBlur = 0;
    g.fillStyle = "#F6F3FF";
    g.font = `500 54px ${sans}`;
    g.textBaseline = "middle";
    g.fillText(f.t, x + 80, y + 64);
    g.fillStyle = "rgba(200, 192, 230, 0.78)";
    g.font = `400 30px ${mono}`;
    g.fillText(f.s, x + 80, y + 126);
    rects.push([x / W, 1 - (y + h) / H, w / W, h / H]);
    aspects.push(w / h);
  });
  const texture = new CanvasTexture(c);
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.anisotropy = 8;
  return { texture, rects, aspects };
}

/** Five ORBIT letters in a tiny atlas for the stage nodes. */
export function buildLetterTexture(letter: string): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.scale(2, 2);
  const mono = getComputedStyle(document.documentElement).getPropertyValue("--font-geist-mono").trim() || "ui-monospace, monospace";
  g.beginPath();
  g.arc(64, 64, 52, 0, Math.PI * 2);
  g.fillStyle = "rgba(10, 8, 34, 0.92)";
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = "rgba(220, 190, 255, 0.85)";
  g.stroke();
  g.fillStyle = "#FAF8FF";
  g.font = `500 52px ${mono}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(letter, 64, 67);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}
