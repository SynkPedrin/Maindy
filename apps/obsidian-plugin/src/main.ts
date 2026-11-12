import { App, Notice, Plugin, PluginSettingTab, Setting, TFile, getAllTags, normalizePath, requestUrl } from 'obsidian';

/**
 * MAINDY for an EXISTING Obsidian vault.
 *  - Pull: memories from MAINDY are written as read-only-ish notes into `<folder>/` (default "MAINDY").
 *  - Push: notes you tag with #maindy are sent once to MAINDY as memories (frontmatter `maindy_id` is
 *    added after a successful upload, so they are never sent twice).
 * Uses only documented Obsidian APIs (vault, metadataCache, requestUrl). Works on desktop and mobile;
 * on iOS it only sees this vault, which is all it needs.
 */

interface Settings {
  apiUrl: string;
  token: string;
  folder: string;
  lastPull: string | null;
  autoSyncMinutes: number;
}

const DEFAULTS: Settings = { apiUrl: 'http://localhost:4000', token: '', folder: 'MAINDY', lastPull: null, autoSyncMinutes: 15 };

interface RemoteMemory {
  id: string;
  title: string;
  content: string;
  type: string;
  category: string;
  provenance: string;
  source: string;
  tags: string[];
  people: Array<{ name: string; relation: string | null }>;
  createdAt: string;
  updatedAt: string;
}

function safeName(s: string): string {
  return s.replace(/[\\/:*?"<>|#^[\]{}]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Sem título';
}

function yamlString(s: string): string {
  return JSON.stringify(s);
}

export default class MaindyPlugin extends Plugin {
  settings: Settings = { ...DEFAULTS };
  private timer: number | null = null;

  async onload() {
    this.settings = { ...DEFAULTS, ...((await this.loadData()) as Partial<Settings> | null) };
    this.addSettingTab(new MaindySettingTab(this.app, this));
    this.addCommand({ id: 'maindy-sync', name: 'Sincronizar com a MAINDY', callback: () => void this.sync(true) });
    this.addRibbonIcon('brain', 'Sincronizar com a MAINDY', () => void this.sync(true));
    this.schedule();
  }

  onunload() {
    if (this.timer !== null) window.clearInterval(this.timer);
  }

  schedule() {
    if (this.timer !== null) window.clearInterval(this.timer);
    if (this.settings.autoSyncMinutes > 0) {
      this.timer = window.setInterval(() => void this.sync(false), this.settings.autoSyncMinutes * 60_000);
      this.registerInterval(this.timer);
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.schedule();
  }

  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    if (!this.settings.token) throw new Error('Configure o token do MAINDY nas opções do plugin.');
    const res = await requestUrl({
      url: `${this.settings.apiUrl.replace(/\/+$/, '')}${path}`,
      method,
      headers: { Authorization: `MaindyVault ${this.settings.token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      throw: false,
    });
    if (res.status >= 400) throw new Error(`MAINDY respondeu ${res.status}: ${(res.json as { message?: string } | undefined)?.message ?? ''}`);
    return res.json as T;
  }

  async sync(verbose: boolean) {
    try {
      const pushed = await this.push();
      const pulled = await this.pull();
      if (verbose) new Notice(`MAINDY: ${pulled} memórias atualizadas, ${pushed} notas enviadas.`);
    } catch (e) {
      new Notice(`MAINDY: ${(e as Error).message}`);
    }
  }

  private async ensureFolder(path: string) {
    if (!this.app.vault.getAbstractFileByPath(path)) await this.app.vault.createFolder(path).catch(() => undefined);
  }

  /** Writes remote memories into the plugin folder. */
  async pull(): Promise<number> {
    const q = this.settings.lastPull ? `?since=${encodeURIComponent(this.settings.lastPull)}` : '';
    const data = await this.call<{ serverTime: string; memories: RemoteMemory[] }>('GET', `/v1/plugin/memories${q}`);
    const folder = normalizePath(this.settings.folder);
    await this.ensureFolder(folder);
    for (const m of data.memories) {
      const path = normalizePath(`${folder}/${m.createdAt.slice(0, 10)} ${safeName(m.title)} (${m.id.slice(0, 8)}).md`);
      const text = [
        '---',
        `maindy_id: ${m.id}`,
        `type: ${m.type}`,
        `category: ${m.category}`,
        `provenance: ${m.provenance}`,
        `source: ${m.source}`,
        `created_at: ${m.createdAt}`,
        `updated_at: ${m.updatedAt}`,
        `tags: [${m.tags.map(yamlString).join(', ')}]`,
        '---',
        '',
        `# ${m.title}`,
        '',
        m.content,
        '',
        m.people.length ? `Pessoas: ${m.people.map((p) => `[[${p.name}]]`).join(', ')}` : '',
        '',
        '> Nota sincronizada pela MAINDY. Edite pelo app para manter tudo consistente.',
        '',
      ].join('\n');
      const existing = this.app.vault.getAbstractFileByPath(path);
      if (existing instanceof TFile) await this.app.vault.modify(existing, text);
      else await this.app.vault.create(path, text);
    }
    this.settings.lastPull = data.serverTime;
    await this.saveData(this.settings);
    return data.memories.length;
  }

  /** Sends notes tagged #maindy (outside the plugin folder) that were not sent yet. */
  async push(): Promise<number> {
    let sent = 0;
    const folder = normalizePath(this.settings.folder);
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (file.path.startsWith(`${folder}/`)) continue;
      const cache = this.app.metadataCache.getFileCache(file);
      if (!cache) continue;
      const tags = getAllTags(cache) ?? [];
      if (!tags.includes('#maindy') || cache.frontmatter?.maindy_id) continue;
      const raw = await this.app.vault.read(file);
      const body = raw.replace(/^---\n[\s\S]*?\n---\n?/, '').replace(/#maindy\b/g, '').trim();
      if (!body) continue;
      const created = await this.call<{ id: string }>('POST', '/v1/plugin/notes', { path: file.path, title: file.basename, content: body.slice(0, 8000) });
      await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
        fm.maindy_id = created.id;
      });
      sent++;
    }
    return sent;
  }
}

class MaindySettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: MaindyPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('p', { text: 'Gere o token no app MAINDY em Ajustes › Vault Obsidian › Gerar token do plugin.' });
    new Setting(containerEl).setName('Endereço da API').addText((t) => t.setValue(this.plugin.settings.apiUrl).onChange(async (v) => { this.plugin.settings.apiUrl = v.trim(); await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName('Token').addText((t) => { t.inputEl.type = 'password'; t.setValue(this.plugin.settings.token).onChange(async (v) => { this.plugin.settings.token = v.trim(); await this.plugin.saveSettings(); }); });
    new Setting(containerEl).setName('Pasta das memórias').addText((t) => t.setValue(this.plugin.settings.folder).onChange(async (v) => { this.plugin.settings.folder = v.trim() || 'MAINDY'; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName('Sincronizar a cada (min)').setDesc('0 desativa').addText((t) => t.setValue(String(this.plugin.settings.autoSyncMinutes)).onChange(async (v) => { this.plugin.settings.autoSyncMinutes = Math.max(0, Number(v) || 0); await this.plugin.saveSettings(); }));
    new Setting(containerEl).addButton((b) => b.setButtonText('Sincronizar agora').setCta().onClick(() => void this.plugin.sync(true)));
  }
}
