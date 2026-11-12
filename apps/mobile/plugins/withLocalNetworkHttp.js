// Allows plain-HTTP calls to the MAINDY API on the local network in test builds
// (the API runs on the developer's Mac, e.g. http://192.168.0.x:4000).
// Production builds should point to an HTTPS API and drop this plugin.
const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withLocalNetworkHttp(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (app) app.$['android:usesCleartextTraffic'] = 'true';
    return cfg;
  });
};
