export const IMAGE_RE = /!\[\]\((\.\/assets\/article\/[^)]+)\)/g;
export function collectImageReferences(markdown) {
    const refs = [];
    for (const match of markdown.matchAll(IMAGE_RE)) {
        refs.push(match[1]);
    }
    return refs;
}
export function replaceImagesWithInlineTags(markdown, inlineTags) {
    const refs = collectImageReferences(markdown);
    if (refs.length !== inlineTags.length) {
        throw new Error(`Image count mismatch: markdown has ${refs.length} references but received ${inlineTags.length} inline tags`);
    }
    let index = 0;
    return markdown.replace(IMAGE_RE, () => {
        const tag = inlineTags[index++];
        return `\n\n${tag}\n\n`;
    });
}
export function stripHeading(markdown) {
    const lines = markdown.split(`\n`);
    if (lines.length && (lines[0] ?? "").startsWith(`# `)) {
        lines.shift();
    }
    return lines.join(`\n`).replace(/^\n+/, ``);
}
//# sourceMappingURL=markdown.js.map