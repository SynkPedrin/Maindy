// Copies the MAINDY orb PNGs into Android drawables (orb_idle / orb_listening) so the native
// floating agent uses the brand artwork instead of its Canvas fallback.
const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withOrbDrawables(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const res = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'drawable-nodpi');
      fs.mkdirSync(res, { recursive: true });
      for (const [src, dest] of [['orb-idle.png', 'orb_idle.png'], ['orb-listening.png', 'orb_listening.png']]) {
        fs.copyFileSync(path.join(cfg.modRequest.projectRoot, 'assets', 'assistant', src), path.join(res, dest));
      }
      return cfg;
    },
  ]);
};
