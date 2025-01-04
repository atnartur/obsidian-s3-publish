# S3 Publish

Uploads note to S3 bucket and creates publicly accessible link.

## Development

- `npm ci` - install modules
- `cp .env.example .env` - copy environment variables template
- Fill `.env` file with a path to your Obsidian Vault which you will use to debug the plugin
- `npm run dev` - start watching for source code updates (updated bundle will be copied to your vault after build)
- Refer to the [Obsidian Guide](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin) to learn how to load the plugin to your Vault
