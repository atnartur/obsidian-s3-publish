# S3 Publish

Uploads note to S3 bucket and creates publicly accessible link.

## How to use

1. Create an [AWS Account](https://aws.amazon.com)
2. Create a [S3 bucket](https://docs.aws.amazon.com/AmazonS3/latest/userguide/GetStartedWithS3.html)
3. [Generate Access Key and Secret Key](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html) for an IAM user which will have upload access to created bucket
4. Install this plugin
5. Fill the plugin settings
6. Execute `S3 Publish: Publish Note` action from Obsidian's Command Pallete
7. The note's public link will be copied to your clipboard

## Development

- `npm ci` - install modules
- `cp .env.example .env` - copy environment variables template
- Fill `.env` file with a path to your Obsidian Vault which you will use to debug the plugin
- `npm run dev` - start watching for source code updates (updated bundle will be copied to your vault after build)
- Refer to the [Obsidian Guide](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin) to learn how to load the plugin to your Vault
