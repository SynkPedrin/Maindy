/** Constantes compartilhadas para que o fim da intro e o loop da esfera encaixem pixel a pixel. */
export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

/** Vídeo original da marca: 6,5 s (24 fps). */
export const BRAND_VIDEO_FRAMES = Math.round(6.5 * FPS); // 195
/** A intro segura o último quadro por 1 s enquanto acontece a transição para a hero. */
export const INTRO_FRAMES = BRAND_VIDEO_FRAMES + FPS; // 225
export const LOOP_FRAMES = 6 * FPS; // 180

/** Cena 6: a composição recua e sobe para abrir espaço ao texto da hero. */
export const SCENE6_START = 172;
export const FINAL_SCALE = 0.8;
export const FINAL_Y = -0.13; // fração da altura

/** Esfera no quadro original (frações do quadro). */
export const ORB = { cx: 0.502, cy: 0.506, r: 0.3 }; // r em fração da ALTURA

export const COLORS = {
  navy: '#05082B',
  navy2: '#080D38',
  purple: '#7900FF',
  electric: '#A100FF',
  yellow: '#FFC400',
  white: '#FFFFFF',
};
