import path from "node:path";
import { collectImageReferences, replaceImagesWithInlineTags, stripHeading } from "./markdown.js";
export function parseArgs(argv) {
    const args = [...argv];
    let identity = "bot";
    let asIdentity;
    while (args.length && (args[0] ?? "").startsWith("--")) {
        const key = args.shift();
        if (key === "--identity") {
            identity = args.shift() ?? "bot";
        }
        else if (key === "--as-identity") {
            asIdentity = args.shift();
        }
        else {
            throw new Error(`Unknown option: ${key}`);
        }
    }
    if (!args.length) {
        throw new Error("Missing required article URL");
    }
    return { url: args[0], identity, asIdentity };
}
export async function fetchLocalMarkdown(ctx, url) {
    const workdir = await ctx.mkdtemp("wechat2larkdoc-");
    const result = await ctx.exec("wechat2md", ["--download", "--output", "article.md", url], { cwd: workdir });
    if (result.exitCode !== 0) {
        throw new Error(`wechat2md failed: ${result.stderr || result.stdout}`);
    }
    const markdownPath = path.join(workdir, "article.md");
    const markdown = await ctx.readFile(markdownPath);
    return { workdir, markdownPath, markdown };
}
function normalizeInlineTag(tag) {
    return tag.replace(/\u003c/g, "<").replace(/\u003e/g, ">").replace(/&amp;/g, "&");
}
export async function createEmptyLarkDoc(ctx, title, identity) {
    const args = ["docs", "+create", "--as", identity, "--title", title, "--markdown", "placeholder"];
    const result = await ctx.exec("lark-cli", args);
    if (result.exitCode !== 0) {
        throw new Error(`lark-cli docs +create failed: ${result.stderr || result.stdout}`);
    }
    const parsed = JSON.parse(result.stdout);
    const docId = parsed.data?.doc_id;
    const docUrl = parsed.data?.doc_url;
    if (!docId || !docUrl) {
        throw new Error("lark-cli docs +create returned no doc_id/doc_url");
    }
    return { docId, docUrl };
}
export async function uploadLocalImages(ctx, docId, workdir, refs, identity) {
    for (const ref of refs) {
        const args = ["docs", "+media-insert", "--as", identity, "--doc", docId, "--file", ref, "--align", "center"];
        const result = await ctx.exec("lark-cli", args, { cwd: workdir });
        if (result.exitCode !== 0) {
            throw new Error(`lark-cli docs +media-insert failed for ${ref}: ${result.stderr || result.stdout}`);
        }
        const parsed = JSON.parse(result.stdout);
        if (!parsed.ok || !parsed.data?.file_token) {
            throw new Error(`lark-cli docs +media-insert returned invalid payload for ${ref}`);
        }
    }
}
const IMAGE_TAG_RE = /<image\s+[^>]*token="[^"]+"[^>]*\/>/g;
export function extractInlineImageTags(fetchMarkdown) {
    return [...fetchMarkdown.matchAll(IMAGE_TAG_RE)].map((m) => normalizeInlineTag(m[0].trim()));
}
export async function fetchInlineImageTags(ctx, docId, identity, expected) {
    const args = ["docs", "+fetch", "--as", identity, "--doc", docId];
    const result = await ctx.exec("lark-cli", args);
    if (result.exitCode !== 0) {
        throw new Error(`lark-cli docs +fetch failed: ${result.stderr || result.stdout}`);
    }
    const parsed = JSON.parse(result.stdout);
    const md = parsed.data?.markdown ?? "";
    const tags = extractInlineImageTags(md);
    if (tags.length !== expected) {
        throw new Error(`Expected ${expected} inline image tags but found ${tags.length}`);
    }
    return tags;
}
export async function overwriteDocWithInlineImages(ctx, docId, markdown, inlineTags, identity) {
    const finalMarkdown = replaceImagesWithInlineTags(markdown, inlineTags);
    const args = ["docs", "+update", "--as", identity, "--doc", docId, "--mode", "overwrite", "--markdown", finalMarkdown];
    const result = await ctx.exec("lark-cli", args);
    if (result.exitCode !== 0) {
        throw new Error(`lark-cli docs +update failed: ${result.stderr || result.stdout}`);
    }
}
export async function grantEditAccess(ctx, docId, asIdentity, identity) {
    const [memberType, memberId] = asIdentity.split(":");
    if (!memberType || !memberId) {
        throw new Error(`Invalid --as-identity value: ${asIdentity}`);
    }
    const payload = JSON.stringify({
        member_id: memberId,
        member_type: memberType === "user" ? "openid" : memberType,
        perm: "edit",
        type: memberType === "user" ? "user" : "chat",
    });
    const args = [
        "drive",
        "permission.members",
        "create",
        "--as",
        identity,
        "--params",
        JSON.stringify({ token: docId, type: "docx", need_notification: false }),
        "--data",
        payload,
    ];
    const result = await ctx.exec("lark-cli", args);
    if (result.exitCode !== 0) {
        throw new Error(`lark-cli permission.members create failed: ${result.stderr || result.stdout}`);
    }
}
export async function run(argv, ctx) {
    const parsed = parseArgs(argv);
    // default ctx intentionally omitted for CLI bootstrap; integration happens later
    if (!ctx) {
        throw new Error("CLI runtime is not wired yet");
    }
    const { workdir, markdown } = await fetchLocalMarkdown(ctx, parsed.url);
    const title = markdown.split(`\n`)[0]?.replace(/^#\s+/, "").trim() || "WeChat Article";
    const refs = collectImageReferences(markdown);
    const { docId, docUrl } = await createEmptyLarkDoc(ctx, title, parsed.identity);
    await uploadLocalImages(ctx, docId, workdir, refs, parsed.identity);
    const inlineTags = await fetchInlineImageTags(ctx, docId, parsed.identity, refs.length);
    const cleanedMarkdown = stripHeading(markdown);
    await overwriteDocWithInlineImages(ctx, docId, cleanedMarkdown, inlineTags, parsed.identity);
    if (parsed.asIdentity) {
        await grantEditAccess(ctx, docId, parsed.asIdentity, parsed.identity);
    }
    console.log(JSON.stringify({ docId, docUrl, imageCount: refs.length, grantedTo: parsed.asIdentity ?? null }));
}
//# sourceMappingURL=commands.js.map