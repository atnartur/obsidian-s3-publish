import {
	App,
	MarkdownView,
	Notice,
	Plugin,
	PluginSettingTab,
	requestUrl,
	RequestUrlParam,
	Setting
} from 'obsidian';
import {Upload} from "@aws-sdk/lib-storage";
import {S3Client} from "@aws-sdk/client-s3";
import {generateHtml} from "./html-generator";
import {FetchHttpHandler, FetchHttpHandlerOptions} from "@smithy/fetch-http-handler";
import {HttpHandlerOptions} from "@smithy/types";
import { type HttpRequest, HttpResponse } from "@smithy/protocol-http";
import { buildQueryString } from "@smithy/querystring-builder";
import { requestTimeout } from "@smithy/fetch-http-handler/dist-es/request-timeout";

interface PDFPublisherSettings {
	awsAccessKeyId: string;
	awsSecretAccessKey: string;
	bucketName: string;
	region: string;
}

const DEFAULT_SETTINGS: PDFPublisherSettings = {
	awsAccessKeyId: '',
	awsSecretAccessKey: '',
	bucketName: '',
	region: 'us-east-1'
}

/**
 * https://stackoverflow.com/questions/8609289
 * @param b Buffer
 * @returns ArrayBuffer
 */
export const bufferToArrayBuffer = (
  b: Buffer | Uint8Array | ArrayBufferView
) => {
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};

class ObsHttpHandler extends FetchHttpHandler {
  requestTimeoutInMs: number | undefined;
  reverseProxyNoSignUrl: string | undefined;
  constructor(
    options?: FetchHttpHandlerOptions,
    reverseProxyNoSignUrl?: string
  ) {
    super(options);
    this.requestTimeoutInMs =
      options === undefined ? undefined : options.requestTimeout;
    this.reverseProxyNoSignUrl = reverseProxyNoSignUrl;
  }
  async handle(
    request: HttpRequest,
    { abortSignal }: HttpHandlerOptions = {}
  ): Promise<{ response: HttpResponse }> {
    if (abortSignal?.aborted) {
      const abortError = new Error("Request aborted");
      abortError.name = "AbortError";
      return Promise.reject(abortError);
    }

    let path = request.path;
    if (request.query) {
      const queryString = buildQueryString(request.query);
      if (queryString) {
        path += `?${queryString}`;
      }
    }

    const { port, method } = request;
    let url = `${request.protocol}//${request.hostname}${
      port ? `:${port}` : ""
    }${path}`;
    if (
      this.reverseProxyNoSignUrl !== undefined &&
      this.reverseProxyNoSignUrl !== ""
    ) {
      const urlObj = new URL(url);
      urlObj.host = this.reverseProxyNoSignUrl;
      url = urlObj.href;
    }
    const body =
      method === "GET" || method === "HEAD" ? undefined : request.body;

    const transformedHeaders: Record<string, string> = {};
    for (const key of Object.keys(request.headers)) {
      const keyLower = key.toLowerCase();
      if (keyLower === "host" || keyLower === "content-length") {
        continue;
      }
      transformedHeaders[keyLower] = request.headers[key];
    }

    let contentType: string | undefined = undefined;
    if (transformedHeaders["content-type"] !== undefined) {
      contentType = transformedHeaders["content-type"];
    }

    let transformedBody: any = body;
    if (ArrayBuffer.isView(body)) {
      transformedBody = bufferToArrayBuffer(body);
    }

    const param: RequestUrlParam = {
      body: transformedBody,
      headers: transformedHeaders,
      method: method,
      url: url,
      contentType: contentType,
    };

    const raceOfPromises = [
      requestUrl(param).then((rsp) => {
        const headers = rsp.headers;
        const headersLower: Record<string, string> = {};
        for (const key of Object.keys(headers)) {
          headersLower[key.toLowerCase()] = headers[key];
        }
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array(rsp.arrayBuffer));
            controller.close();
          },
        });
        return {
          response: new HttpResponse({
            headers: headersLower,
            statusCode: rsp.status,
            body: stream,
          }),
        };
      }),
      requestTimeout(this.requestTimeoutInMs),
    ];

    if (abortSignal) {
      raceOfPromises.push(
        new Promise<never>((resolve, reject) => {
          abortSignal.onabort = () => {
            const abortError = new Error("Request aborted");
            abortError.name = "AbortError";
            reject(abortError);
          };
        })
      );
    }
    return Promise.race(raceOfPromises);
  }
}

class S3RequestHandler extends FetchHttpHandler {
	async handle(httpRequest: HttpRequest, options?: HttpHandlerOptions): Promise<{ response: HttpResponse }> {
		console.log('original request', httpRequest);
		console.log('original options', options);

		const plainQueryObject: {[key: string]: any} = {};
		Object.entries(httpRequest.query)
			// skip some headers as it was in
			// https://github.com/remotely-save/remotely-save/blob/master/src/fsS3.ts#L94C24-L94C41
			.filter(([key]) => !['host', 'content-length'].contains(key.toLowerCase()))
			.forEach(([key, value]) => plainQueryObject[key] = value);

		const params = {
			method: httpRequest.method,
			url: `${httpRequest.protocol}//${httpRequest.hostname}${httpRequest.path}?${new URLSearchParams(plainQueryObject).toString()}`,
			body: httpRequest.body,
			headers: httpRequest.headers
		};
		console.log('obsidian req params', params);

		const response = await requestUrl(params)
		console.log('obsidian response', response);

		return {response: {statusCode: response.status, reason: response.text, headers: response.headers}};
		// return super.handle(request, options);
	}
}

export default class PDFPublisherPlugin extends Plugin {
	settings: PDFPublisherSettings;

	async onload() {
		await this.loadSettings();

		// Add status bar item
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('PDF Publisher');

		// Add commands
		this.addCommand({
			id: 'publish-current-note',
			name: 'Publish Current Note as PDF',
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

		try {
			// Export to PDF
			const content = await this.app.vault.read(file);
			const html = generateHtml(content, file.name)
			console.log(html);
			console.log(await this.uploadToS3(html, `${file.name}.pdf`));

			new Notice('PDF successfully published to S3');
		} catch (error) {
			new Notice(`Error publishing PDF: ${error.message}`);
			console.error(error);
		}
	}

	private async uploadToS3(buffer: string, key: string): Promise<void> {
		const parallelUploads3 = new Upload({
			client: new S3Client({
				credentials: {
					accessKeyId: this.settings.awsAccessKeyId,
					secretAccessKey: this.settings.awsSecretAccessKey,
				},
				requestHandler: new ObsHttpHandler({
					requestTimeout: 600000,
				}),
				region: this.settings.region,
			}),
			params: {Bucket: this.settings.bucketName, Key: key, Body: buffer},
		});

		parallelUploads3.on("httpUploadProgress", (progress) => {
			console.log(progress);
		});

		await parallelUploads3.done();
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

		containerEl.createEl('h2', {text: 'PDF Publisher Settings'});

		new Setting(containerEl)
			.setName('AWS Access Key ID')
			.setDesc('Enter your AWS access key ID')
			.addText(text => text
				.setPlaceholder('Access Key ID')
				.setValue(this.plugin.settings.awsAccessKeyId)
				.onChange(async (value) => {
					this.plugin.settings.awsAccessKeyId = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('AWS Secret Access Key')
			.setDesc('Enter your AWS secret access key')
			.addText(text => text
				.setPlaceholder('Secret Access Key')
				.setValue(this.plugin.settings.awsSecretAccessKey)
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
