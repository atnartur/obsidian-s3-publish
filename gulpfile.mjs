import {src, dest} from 'gulp';
import path from "node:path";
import manifest from './manifest.json' with { type: "json" };

export function copy() {
	return src(['main.js', 'manifest.json'])
		.pipe(dest(path.join(process.env.VAULT_DIR, '.obsidian', 'plugins', manifest.id)));
}
