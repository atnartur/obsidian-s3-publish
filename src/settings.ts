export interface PDFPublisherSettings {
	awsAccessKeyId: string;
	awsSecretAccessKey: string;
	bucketName: string;
	region: string;
}

export const DEFAULT_SETTINGS: PDFPublisherSettings = {
	awsAccessKeyId: '',
	awsSecretAccessKey: '',
	bucketName: '',
	region: 'us-east-1'
}
