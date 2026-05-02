import { describe, expect, it } from "vitest";
import {
  collectImageReferences,
  replaceImagesWithInlineTags,
  stripHeading,
} from "./markdown.js";

const sample = `# Title

Author block

![](./assets/article/a.png)

Second paragraph

![](./assets/article/b.jpg)

Third paragraph
`;

describe("collectImageReferences", () => {
  it("should extract local image refs in order", () => {
    expect(collectImageReferences(sample)).toEqual([
      "./assets/article/a.png",
      "./assets/article/b.jpg",
    ]);
  });

  it("should ignore other image urls", () => {
    const text = `![](https://example.com/a.png)\n\n![](./assets/article/x.png)`;
    expect(collectImageReferences(text)).toEqual(["./assets/article/x.png"]);
  });
});

describe("replaceImagesWithInlineTags", () => {
  it("should replace images with inline tags in order", () => {
    const result = replaceImagesWithInlineTags(sample, [
      `TAG_A`,
      `TAG_B`,
    ]);
    expect(result).toContain(`TAG_A`);
    expect(result).toContain(`TAG_B`);
    expect(result).not.toContain(`./assets/article/a.png`);
    expect(result.indexOf(`TAG_A`)).toBeLessThan(result.indexOf(`TAG_B`));
  });

  it("should throw when tag count mismatches", () => {
    expect(() => replaceImagesWithInlineTags(sample, [`TAG_A`])).toThrow(
      /Image count mismatch/,
    );
  });
});

describe("stripHeading", () => {
  it("should remove leading h1", () => {
    expect(stripHeading(sample).startsWith("# Title")).toBe(false);
  });

  it("should keep other content", () => {
    expect(stripHeading(sample)).toContain("Author block");
  });
});
