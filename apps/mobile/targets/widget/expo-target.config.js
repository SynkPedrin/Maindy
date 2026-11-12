// @bacons/apple-targets target config (v5.x). See docs/NATIVE.md.
// Files in ./_shared are compiled into BOTH this widget extension and the main app target
// (required for App Intents with openAppWhenRun and for Control widgets).

const APP_GROUP = 'group.com.maindy.app';

/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  name: 'MaindyWidget',
  displayName: 'MAINDY',
  // Appended to the main bundle id -> com.maindy.app.widget
  bundleIdentifier: '.widget',
  deploymentTarget: '17.0',
  colors: {
    $widgetBackground: '#05082B',
    $accent: '#7600FF',
  },
  entitlements: {
    'com.apple.security.application-groups': [APP_GROUP],
  },
});
