import { readFileSync } from 'fs';
import path from 'path';
// import markdownit from 'markdown-it'
// import mdAnchor from 'markdown-it-anchor';
// import mdHighlightjs from 'markdown-it-highlightjs';
// import mdCheckbox from 'markdown-it-checkbox';
// import mdMark from 'markdown-it-mark';
import nunjucks from 'nunjucks';
// import markdownToc from 'markdown-toc';
import highlightJsStyles from 'highlightjs/styles/github.css';
import templateContent from './layout.njk'
import * as marked from 'marked';

// nunjucks
nunjucks.configure({ autoescape: false });
const template = nunjucks.compile(templateContent);

/** slugs generator for table of content */
// const slugify = (s: string) => encodeURIComponent(String(s).trim().toLowerCase().replace(/\s+/g, '-'))

// markdown
// const md = markdownit({ breaks: true, linkify: true });
// md.use(mdAnchor, { slugify });
// md.use(mdHighlightjs, { auto: false });
// md.use(mdCheckbox);
// md.use(mdMark);


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
        highlightJsStyles,
        title: splittedFileName.slice(2).join(" ").replace('.md', ''),
        date,
        content: replaceImagesWikiTags(marked.parse(fileContent)),
        // toc: md.render(markdownToc(fileContent, {slugify}).content)
    });
}
