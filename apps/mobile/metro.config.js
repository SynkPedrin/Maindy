// Metro config for the monorepo. The default Expo config watches every workspace folder;
// sibling apps (web, brand-video, desktop with its SwiftPM .build tree) make the crawler stall,
// so only the app itself, packages/* and the root node_modules are watched.
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const root = path.resolve(projectRoot, '../..');
const config = getDefaultConfig(projectRoot);

config.watchFolders = [path.join(root, 'node_modules'), path.join(root, 'packages')];
const esc = (p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const blocked = ['apps/web', 'apps/brand-video', 'apps/desktop', 'apps/api', 'apps/obsidian-plugin'].map(
  (p) => new RegExp(`^${esc(path.join(root, p))}(/.*)?$`),
);
const prev = config.resolver.blockList;
config.resolver.blockList = [...(Array.isArray(prev) ? prev : prev ? [prev] : []), ...blocked];

module.exports = config;
