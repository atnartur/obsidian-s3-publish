import {requestUrl, RequestUrlParam} from 'obsidian';
import {FetchHttpHandler, FetchHttpHandlerOptions} from "@smithy/fetch-http-handler";
import {HttpHandlerOptions} from "@smithy/types";
import {type HttpRequest, HttpResponse} from "@smithy/protocol-http";
import {buildQueryString} from "@smithy/querystring-builder";
import {requestTimeout} from "@smithy/fetch-http-handler/dist-es/request-timeout";
import {Upload} from "@aws-sdk/lib-storage";
import {S3Client} from "@aws-sdk/client-s3";

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
		{abortSignal}: HttpHandlerOptions = {}
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

		const {port, method} = request;
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

export default async function uploadFile(
	accessKey: string, secretKey: string, region: string, bucket: string, key: string, body: string, contentType: string
) {
	const upload = new Upload({
		client: new S3Client({
			credentials: {
				accessKeyId: accessKey,
				secretAccessKey: secretKey,
			},
			requestHandler: new ObsHttpHandler({
				requestTimeout: 600000,
			}),
			region: region,
		}),
		params: {
			Bucket: bucket,
			Key: key,
			Body: body,
			ContentType: contentType,
			ACL: 'public-read'
		},
	});
	await upload.done();

	const url = new URL(key, `https://${bucket}.s3.${region}.amazonaws.com`);
	return url.toString();
}
