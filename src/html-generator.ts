import { readFileSync } from 'fs';
import path from 'path';
import nunjucks from 'nunjucks';
import templateContent from './layout.html'
import {Marked} from 'marked';
import { markedHighlight } from "marked-highlight";
import hljs from 'highlight.js';
import highlightJsStyles from 'highlight.js/styles/github-dark.css';
import picoClassless from '@picocss/pico/css/pico.classless.min.css';

const marked = new Marked(
  markedHighlight({
	emptyLangClass: 'hljs',
    langPrefix: 'hljs language-',
    highlight(code, lang, info) {
      const language = hljs.getLanguage(lang) ? lang : 'plaintext';
      return hljs.highlight(code, { language }).value;
    }
  })
);

nunjucks.configure({ autoescape: false });
const template = nunjucks.compile(templateContent);

/** check image format */
function checkFormatImage(line: string) {
    const imgFormats = ['.jpg', '.jpeg', '.png', '.gif', '.webp']

    for (const item of imgFormats) {
        if (line.endsWith(item)) {
            return true;
        }
    }
    return false;
}

function getContentBase64(content) {
    const buff = Buffer.from(content);
    return buff.toString('base64');
}

/** convert image to base64 */
function imageToBase64(item: string) {
    const img = readFileSync(path.join(config.FOLDER, item));
    const base64 = getContentBase64(img);
    const linkArr = item.split('.');
    const format = linkArr[linkArr.length - 1];
    return `<img src="data:image/${format};base64,${base64}" alt=""/>`;
}

/** replace images in file */
function replaceImagesWikiTags(content) {
    return content.split(/[!]+[\[]{2}(.*)[\]]{2}/).map((item) => {
        if (item.startsWith('images')) {
            return imageToBase64(item)
        } else if (checkFormatImage(item)) {
            return imageToBase64(path.join('images', item))
        }
        return item
    }).join('');
}

export function generateHtml(fileContent: string, fileName: string) {
    const splittedFileName = fileName.split(" ");
    const date = splittedFileName.slice(0, 2).join(" ").split('/').slice(-1)[0];
    return template.render({
        styles: picoClassless + highlightJsStyles,
        title: splittedFileName.slice(2).join(" ").replace('.md', ''),
        date,
        content: replaceImagesWikiTags(marked.parse(fileContent)),
    });
}
