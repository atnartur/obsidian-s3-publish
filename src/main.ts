import {
	App,
	MarkdownView,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting
} from 'obsidian';
import crypto from 'crypto';
import {generateHtml} from "./html-generator";
import {DEFAULT_SETTINGS, PDFPublisherSettings} from "./settings";
import uploadFile from "./s3";

export default class PDFPublisherPlugin extends Plugin {
	settings: PDFPublisherSettings;

	async onload() {
		await this.loadSettings();

		// Add commands
		this.addCommand({
			id: 'publish-current-note',
			name: 'Publish Note',
			checkCallback: (checking: boolean) => {
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					if (!checking) {
						this.publishCurrentNote();
					}
					return true;
				}
				return false;
			}
		});

		// Add settings tab
		this.addSettingTab(new PDFPublisherSettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private getFileName(noteFileName: string): string {
		const fileName = noteFileName.replace('.md', '');
		const shasum = crypto.createHash('sha1');
		shasum.update(this.settings.awsSecretAccessKey + fileName);
		return `${fileName}-${shasum.digest('hex').slice(0, 6)}.html`;
	}

	private validateSettings() {
		return [
			this.settings.awsAccessKeyId,
			this.settings.awsSecretAccessKey,
			this.settings.region,
			this.settings.bucketName
		].every(x => !!x)
	}

	async publishCurrentNote() {
		const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!markdownView) {
			new Notice('No active markdown view');
			return;
		}

		const file = markdownView.file;
		if (!file) {
			new Notice('No file is currently open');
			return;
		}

		if (!this.validateSettings()) {
			new Notice('Fill AWS parameters in the S3 Publish plugin settings');
			return;
		}

		try {
			const content = await this.app.vault.read(file);
			const html = generateHtml(content, file.name)
			const url = await uploadFile(
				this.settings.awsAccessKeyId,
				this.settings.awsSecretAccessKey,
				this.settings.region,
				this.settings.bucketName,
				this.getFileName(file.name),
				html,
				'text/html'
			);
            await navigator.clipboard.writeText(url);
			new Notice('Public file link has been copied');
		} catch (error) {
			new Notice(`Error publishing PDF: ${error.message}`);
			console.error(error);
		}
	}
}

class PDFPublisherSettingTab extends PluginSettingTab {
	plugin: PDFPublisherPlugin;

	constructor(app: App, plugin: PDFPublisherPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();

		containerEl.createEl('h2', {text: 'PDF Publish Settings'});

		new Setting(containerEl)
			.setName('AWS Access Key ID')
			.setDesc('Enter your AWS access key ID')
			.addText(text => text
				.setPlaceholder(this.plugin.settings.awsAccessKeyId ? 'Saved value is not shown' : '')
				.onChange(async (value) => {
					this.plugin.settings.awsAccessKeyId = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('AWS Secret Access Key')
			.setDesc('Enter your AWS secret access key')
			.addText(text => text
				.setPlaceholder(this.plugin.settings.awsSecretAccessKey ? 'Saved value is not shown' : '')
				.onChange(async (value) => {
					this.plugin.settings.awsSecretAccessKey = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('S3 Bucket Name')
			.setDesc('Enter your S3 bucket name')
			.addText(text => text
				.setPlaceholder('Bucket Name')
				.setValue(this.plugin.settings.bucketName)
				.onChange(async (value) => {
					this.plugin.settings.bucketName = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('AWS Region')
			.setDesc('Enter your AWS region')
			.addText(text => text
				.setPlaceholder('us-east-1')
				.setValue(this.plugin.settings.region)
				.onChange(async (value) => {
					this.plugin.settings.region = value;
					await this.plugin.saveSettings();
				}));
	}
}
