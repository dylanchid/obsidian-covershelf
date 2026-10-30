import { App, PluginSettingTab, Setting } from 'obsidian';
import type CovershelfPlugin from './main';

export class CovershelfSettingTab extends PluginSettingTab {
  plugin: CovershelfPlugin;

  constructor(app: App, plugin: CovershelfPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('p', {
      text: 'Configure the folders CoverShelf scans for book notes and cover images.',
      cls: 'setting-item-description',
    });

    new Setting(containerEl)
      .setName('Books folder')
      .setDesc('Vault folder containing book notes (must match your .base file filter).')
      .addText((text) =>
        text
          .setPlaceholder('Books')
          .setValue(this.plugin.settings.booksFolder)
          .onChange(async (value) => {
            this.plugin.settings.booksFolder = value.trim() || 'Books';
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Covers folder')
      .setDesc('Vault folder where downloaded cover images are saved.')
      .addText((text) =>
        text
          .setPlaceholder('Books/covers')
          .setValue(this.plugin.settings.coversFolder)
          .onChange(async (value) => {
            this.plugin.settings.coversFolder = value.trim() || 'Books/covers';
            await this.plugin.saveSettings();
          })
      );
  }
}
