# @maindy/brand-video

Composições Remotion da marca MAINDY, usadas na hero da landing page.

- **MaindyIntro** (1920×1080, 30 fps, 7,5 s): o vídeo original da marca, preservado sem alterações, mais camadas Remotion: luz lateral, luz amarela, partículas convergindo, reflexo na esfera e, na cena 6, o enquadramento final que abre espaço para o texto da hero.
- **OrbLoop** (1920×1080, 6 s): loop sem emenda da esfera respirando, no mesmo enquadramento do fim da intro.

O enquadramento compartilhado está em `src/framing.ts`. Para mudar a posição ou o tamanho da esfera na hero, edite esse arquivo e renderize de novo.

```bash
pnpm studio    # pré-visualização
pnpm render    # gera out/ e copia para apps/web/public/assets/maindy/animations
```
