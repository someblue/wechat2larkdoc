export const IMAGE_RE = /!\[\]\((\.\/assets\/article\/[^)]+)\)/g;

export function collectImageReferences(markdown: string): string[] {
  const refs: string[] = [];
  for (const match of markdown.matchAll(IMAGE_RE)) {
    refs.push(match[1] as string);
  }
  return refs;
}

export function replaceImagesWithInlineTags(
  markdown: string,
  inlineTags: string[],
): string {
  const refs = collectImageReferences(markdown);
  if (refs.length !== inlineTags.length) {
    throw new Error(
      `Image count mismatch: markdown has ${refs.length} references but received ${inlineTags.length} inline tags`,
    );
  }

  let index = 0;
  return markdown.replace(IMAGE_RE, () => {
    const tag = inlineTags[index++] as string;
    return `\n\n${tag}\n\n`;
  });
}

export function stripHeading(markdown: string): string {
  const lines = markdown.split(`\n`);
  if (lines.length && (lines[0] ?? "").startsWith(`# `)) {
    lines.shift();
  }
  return lines.join(`\n`).replace(/^\n+/, ``);
}
