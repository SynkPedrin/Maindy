/**
 * The film's shot list. One entry per scene, in scroll order.
 * `len` is the scene's scroll length in viewport heights (desktop / mobile). Scenes are laid out
 * back to back, so scene i's local progress hits 1 exactly when scene i+1 starts at 0 — the
 * global coordinate `s = index + local` is continuous and drives everything (camera, shaders, copy).
 */
export const SCENES = [
  { id: "hero", anchor: "produto", label: "Início", len: { d: 1.0, m: 1.0 } },
  { id: "overload", anchor: "custo", label: "O custo invisível", len: { d: 1.4, m: 1.3 } },
  { id: "shift", anchor: "virada", label: "A virada", len: { d: 1.2, m: 1.2 } },
  { id: "meet", anchor: "maindy", label: "maindy.", len: { d: 1.1, m: 1.1 } },
  { id: "demo", anchor: "como-funciona", label: "Na prática", len: { d: 1.5, m: 1.6 } },
  { id: "orbit", anchor: "orbit", label: "ORBIT Engine", len: { d: 1.8, m: 1.8 } },
  { id: "quality", anchor: "qualidade", label: "Quality Guard", len: { d: 1.2, m: 1.2 } },
  { id: "assistant", anchor: "no-seu-mac", label: "Sempre por perto", len: { d: 1.1, m: 1.1 } },
  { id: "clarity", anchor: "clareza", label: "Clareza", len: { d: 1.0, m: 1.0 } },
  { id: "product", anchor: "app", label: "O app", len: { d: 1.6, m: 1.6 } },
  { id: "final", anchor: "baixar", label: "Baixar", len: { d: 2.0, m: 2.0 } },
] as const;

export type SceneId = (typeof SCENES)[number]["id"];
export const SCENE_INDEX = Object.fromEntries(SCENES.map((s, i) => [s.id, i])) as Record<SceneId, number>;
export const SCENE_COUNT = SCENES.length;
